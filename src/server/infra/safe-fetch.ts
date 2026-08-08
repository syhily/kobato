import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { isBlockedFetchHost, tryParseUrl } from '@/shared/utils/safe-url'

// SSRF-guarded outbound-fetch for all server-side downloads. Failures
// return a typed union; callers map them to their own error modes.

export const SAFE_FETCH_DEFAULT_TIMEOUT_MS = 10_000
export const SAFE_FETCH_DEFAULT_MAX_REDIRECTS = 5

export interface SafeFetchOptions {
  /** Per-request timeout (each redirect hop gets a fresh budget). */
  timeoutMs?: number
  /** Byte cap enforced against both the Content-Length header (before the
   *  body is read) and the actual buffered body. Omit for no cap. */
  maxBytes?: number
  headers?: Record<string, string>
  /** Redirect budget. `0` rejects the first 3xx outright. */
  maxRedirects?: number
  /** Per-hop veto after the SSRF guard, before the hop is fetched; return `false` to stop with `redirect-vetoed`. */
  shouldFollowRedirect?: (nextUrl: URL) => boolean
  /** HTTP method (default GET). Redirects follow the fetch spec: 303 (always) and 301/302 (for POST) become a bodiless GET; 307/308 carry forward. */
  method?: string
  body?: string
  /** Return the final response with its body still streaming (cap-guarded when `maxBytes` is given) instead of buffering it into `body`. */
  stream?: boolean
}

export type SafeFetchFailureReason =
  | 'invalid-url'
  | 'bad-protocol'
  | 'blocked-host'
  | 'too-many-redirects'
  | 'missing-redirect-location'
  | 'redirect-vetoed'
  | 'timeout'
  | 'too-large'
  | 'http-error'
  | 'fetch-failed'

export interface SafeFetchFailure {
  ok: false
  reason: SafeFetchFailureReason
  /** The URL that triggered the failure — the initial URL, the redirect
   *  target that was rejected, or the hop whose fetch failed. */
  url: string
  /** Upstream status; set only for `http-error`. */
  status: number | null
  /** The thrown error; set only for `fetch-failed` / `timeout`. */
  error: unknown
}

export interface SafeFetchSuccess {
  ok: true
  /** Final URL after any redirects. */
  url: string
  /** The final response. Its body has already been buffered into `body`,
   *  so read the bytes from there, not from the response. */
  response: Response
  /** Buffered body — already size-checked when `maxBytes` was given. */
  body: ArrayBuffer
}

export interface SafeFetchStreamSuccess {
  ok: true
  /** Final URL after any redirects. */
  url: string
  /** The final response with its body still live (NOT buffered); with `maxBytes` the body errors mid-stream past the cap. */
  response: Response
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure
export type SafeFetchStreamResult = SafeFetchStreamSuccess | SafeFetchFailure

function failure(
  reason: SafeFetchFailureReason,
  url: string,
  status: number | null = null,
  error: unknown = null,
): SafeFetchFailure {
  return { ok: false, reason, url, status, error }
}

function isTimeoutError(error: unknown): boolean {
  // undici's `AbortSignal.timeout` rejects with a DOMException named 'TimeoutError'.
  return error instanceof Error && error.name === 'TimeoutError'
}

/** Validate one target against the protocol allowlist, SSRF guard, and DNS:
 *  every resolved address must pass the blocklist; a lookup failure doesn't reject. */
async function guardTarget(parsed: URL, url: string): Promise<SafeFetchFailure | null> {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure('bad-protocol', url)
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    return failure('blocked-host', url)
  }
  // IP literals are fully validated by isBlockedFetchHost — skip the DNS lookup.
  const bare =
    parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']') ? parsed.hostname.slice(1, -1) : parsed.hostname
  if (isIP(bare) !== 0) {
    return null
  }
  let addresses: { address: string }[]
  try {
    addresses = await lookup(bare, { all: true })
  } catch {
    return null
  }
  for (const { address } of addresses) {
    if (isBlockedFetchHost(address)) {
      return failure('blocked-host', url)
    }
  }
  return null
}

/** Byte-counting stream guard: past `maxBytes` the stream errors and the upstream body is cancelled. */
function capByteStream(source: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let total = 0
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength
        if (total > maxBytes) {
          controller.error(new Error(`safeFetch: response exceeded ${maxBytes} bytes`))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

/** Read a response body chunk by chunk, enforcing `maxBytes` as the
 *  bytes arrive (cancel the reader the moment the cap trips) instead of
 *  buffering the whole body first. */
async function readCappedBody(
  response: Response,
  maxBytes: number | undefined,
  url: string,
): Promise<{ ok: true; body: ArrayBuffer } | SafeFetchFailure> {
  if (response.body === null) {
    return { ok: true, body: new ArrayBuffer(0) }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      total += value.byteLength
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return failure('too-large', url)
      }
      chunks.push(value)
    }
  } catch (error) {
    return failure('fetch-failed', url, null, error)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, body: body.buffer }
}

export function safeFetch(url: string, options: SafeFetchOptions & { stream: true }): Promise<SafeFetchStreamResult>
export function safeFetch(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult>
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult | SafeFetchStreamResult> {
  const {
    timeoutMs = SAFE_FETCH_DEFAULT_TIMEOUT_MS,
    maxBytes,
    headers,
    maxRedirects = SAFE_FETCH_DEFAULT_MAX_REDIRECTS,
    shouldFollowRedirect,
    stream = false,
    method = 'GET',
    body,
  } = options

  const initial = tryParseUrl(url)
  if (initial === null) {
    return failure('invalid-url', url)
  }
  const initialRejection = await guardTarget(initial, url)
  if (initialRejection !== null) {
    return initialRejection
  }

  let currentUrl = url
  // Per-hop request shape — a redirect may rewrite method/body and drop content headers.
  let hopMethod = method
  let hopBody = body
  let hopHeaders = headers
  let response: Response
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: hopHeaders,
        method: hopMethod,
        body: hopBody,
      })
    } catch (error) {
      return failure(isTimeoutError(error) ? 'timeout' : 'fetch-failed', currentUrl, null, error)
    }
    if (response.status < 300 || response.status >= 400) {
      break
    }
    if (hop >= maxRedirects) {
      return failure('too-many-redirects', currentUrl)
    }
    const location = response.headers.get('location')
    if (location === null) {
      return failure('missing-redirect-location', currentUrl)
    }
    let nextUrl: URL
    try {
      nextUrl = new URL(location, currentUrl)
    } catch {
      return failure('invalid-url', location)
    }
    // Re-validate every hop: a remote server can 302 toward an internal address.
    const hopRejection = await guardTarget(nextUrl, nextUrl.toString())
    if (hopRejection !== null) {
      return hopRejection
    }
    if (shouldFollowRedirect !== undefined && !shouldFollowRedirect(nextUrl)) {
      return failure('redirect-vetoed', nextUrl.toString())
    }
    // Fetch spec: 303 (and 301/302 for POST) become a bodiless GET; 307/308 carry forward.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && hopMethod === 'POST')) {
      hopMethod = 'GET'
      hopBody = undefined
      if (hopHeaders !== undefined) {
        // Header names are case-insensitive — match the caller's casing.
        hopHeaders = Object.fromEntries(
          Object.entries(hopHeaders).filter(([name]) => {
            const lower = name.toLowerCase()
            return lower !== 'content-type' && lower !== 'content-length'
          }),
        )
      }
    }
    currentUrl = nextUrl.toString()
  }

  if (!response.ok) {
    return failure('http-error', currentUrl, response.status)
  }

  if (maxBytes !== undefined) {
    const length = response.headers.get('content-length')
    if (length !== null) {
      const expected = Number.parseInt(length, 10)
      if (Number.isFinite(expected) && expected > maxBytes) {
        return failure('too-large', currentUrl)
      }
    }
  }

  if (stream) {
    const body =
      response.body !== null && maxBytes !== undefined ? capByteStream(response.body, maxBytes) : response.body
    return {
      ok: true,
      url: currentUrl,
      response: new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    }
  }

  const bodyResult = await readCappedBody(response, maxBytes, currentUrl)
  if (!bodyResult.ok) {
    return bodyResult
  }
  return { ok: true, url: currentUrl, response, body: bodyResult.body }
}

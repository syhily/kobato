import type { LookupAddress, LookupOptions } from 'node:dns'

import { lookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import { Agent } from 'undici'

import { isBlockedFetchHost, tryParseUrl } from '@/shared/utils/safe-url'

// SSRF-guarded outbound-fetch for all server-side downloads. Failures
// return a typed union; callers map them to their own error modes.
//
// Two layers, and the second one is the authoritative guard:
//  1. `guardTarget` pre-checks protocol / host / resolved addresses so a
//     blocked target fails deterministically before a socket is opened.
//  2. every call dials through a per-call undici `Agent` whose `lookup`
//     re-resolves the hostname AT CONNECT TIME and fails closed. The socket
//     can only ever reach an address that this lookup validated, so an
//     authoritative DNS server cannot answer the pre-check with a public
//     address and the dial with 127.0.0.1 (DNS rebinding / TOCTOU).

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
  | 'dns-failure'
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
  /** The thrown error; set only for `dns-failure` / `fetch-failed` / `timeout`. */
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

/** Bracketed IPv6 literals (`[::1]`) → the bare address `dns.lookup` wants. */
function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function noAddressError(host: string): Error {
  return new Error(`safeFetch: DNS returned no address for ${host}`)
}

function blockedAddressError(host: string, address: string): Error {
  return new Error(`safeFetch: ${host} resolves to a blocked address (${address})`)
}

/** `dns.LookupOptions.family` accepts the `'IPv4'`/`'IPv6'` string forms
 *  since Node 22; the numeric form is what this resolver forwards. */
function familyNumber(family: LookupOptions['family']): number {
  if (family === 'IPv4') {
    return 4
  }
  if (family === 'IPv6') {
    return 6
  }
  return family ?? 0
}

/** Resolve + validate one dial. Throws on a resolution failure, an empty
 *  answer, or ANY blocked address — the socket never sees a peer the
 *  blocklist would reject. */
async function resolveForDial(host: string, family: number, hints: number): Promise<LookupAddress[]> {
  const addresses = await lookup(host, { all: true, family, hints })
  if (addresses.length === 0) {
    throw noAddressError(host)
  }
  for (const { address } of addresses) {
    if (isBlockedFetchHost(address)) {
      throw blockedAddressError(host, address)
    }
  }
  return addresses
}

/** The single resolution a dial is allowed to use: every address is
 *  validated at connect time and only validated addresses are handed to
 *  the socket. Failures abort the connection (fail closed). */
function createDialLookup(): LookupFunction {
  return (hostname, options, callback) => {
    const bare = bareHostname(hostname)
    const literal = isIP(bare)
    if (literal !== 0) {
      if (isBlockedFetchHost(bare)) {
        callback(blockedAddressError(bare, bare), '')
        return
      }
      const family = literal === 6 ? 6 : 4
      if (options.all === true) {
        callback(null, [{ address: bare, family }])
      } else {
        callback(null, bare, family)
      }
      return
    }
    void (async () => {
      try {
        const addresses = await resolveForDial(bare, familyNumber(options.family), options.hints ?? 0)
        if (options.all === true) {
          callback(null, addresses)
        } else if (addresses[0] !== undefined) {
          callback(null, addresses[0].address, addresses[0].family)
        }
      } catch (error) {
        callback(error instanceof Error ? error : new TypeError(String(error)), '')
      }
    })()
  }
}

/** Validate one target against the protocol allowlist, SSRF guard, and DNS:
 *  a lookup failure (or a host that resolves to nothing) is a failure, and
 *  every resolved address must pass the blocklist. */
async function guardTarget(parsed: URL, url: string): Promise<SafeFetchFailure | null> {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure('bad-protocol', url)
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    return failure('blocked-host', url)
  }
  // IP literals are fully validated by isBlockedFetchHost — skip the DNS lookup.
  // (undici does not call `lookup` for a literal either; the pre-check is the guard there.)
  const bare = bareHostname(parsed.hostname)
  if (isIP(bare) !== 0) {
    return null
  }
  let addresses: { address: string; family: number }[]
  try {
    addresses = await lookup(bare, { all: true })
  } catch (error) {
    return failure('dns-failure', url, null, error)
  }
  if (addresses.length === 0) {
    return failure('dns-failure', url, null, noAddressError(bare))
  }
  for (const { address } of addresses) {
    if (isBlockedFetchHost(address)) {
      return failure('blocked-host', url)
    }
  }
  return null
}

/** Body stream that enforces `maxBytes` as bytes arrive AND releases the
 *  per-call agent once the consumer is done with it (flush, cancel, or a
 *  cap trip). Stream mode returns a live body, so the agent cannot be
 *  destroyed when `safeFetch` returns — ownership rides the stream. */
function guardStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number | undefined,
  agent: Agent,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let total = 0
  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true
    void agent.destroy().catch(() => undefined)
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          release()
          return
        }
        total += value.byteLength
        if (maxBytes !== undefined && total > maxBytes) {
          controller.error(new Error(`safeFetch: response exceeded ${maxBytes} bytes`))
          await reader.cancel().catch(() => undefined)
          release()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        controller.error(error)
        release()
      }
    },
    async cancel(reason) {
      release()
      await reader.cancel(reason)
    },
  })
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

  // One agent per call: every hop — including redirect targets — dials
  // through the same validating lookup. A fresh agent never reuses a
  // connection validated by a previous call.
  const agent = new Agent({ connect: { lookup: createDialLookup() } })
  let agentOwnedByStream = false

  try {
    let currentUrl = url
    // Per-hop request shape — a redirect may rewrite method/body and drop content headers.
    let hopMethod = method
    let hopBody = body
    let hopHeaders = headers
    let response: Response
    for (let hop = 0; ; hop++) {
      try {
        // `dispatcher` is undici's Agent hook (the global fetch is undici-backed).
        const init: RequestInit & { dispatcher: Agent } = {
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: hopHeaders,
          method: hopMethod,
          body: hopBody,
          dispatcher: agent,
        }
        response = await fetch(currentUrl, init)
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
      if (response.body === null) {
        return {
          ok: true,
          url: currentUrl,
          response: new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        }
      }
      // The body outlives this call — the stream releases the agent.
      agentOwnedByStream = true
      return {
        ok: true,
        url: currentUrl,
        response: new Response(guardStream(response.body, maxBytes, agent), {
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
  } finally {
    if (!agentOwnedByStream) {
      await agent.destroy().catch(() => undefined)
    }
  }
}

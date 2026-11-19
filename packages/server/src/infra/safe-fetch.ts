import type { SafeFetchOperation } from '@kobato/server/infra/trace/sanitize.ts'
import type { LookupAddress, LookupOptions } from 'node:dns'

import { isBlockedFetchHost } from '@kobato/auth/network.ts'
import { isTraceActive, withSpanAsync } from '@kobato/server/infra/trace/facade.ts'
import { tryParseUrl } from '@kobato/utils/safe-url.ts'
import { lookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import { Agent } from 'undici'

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
  /** Opt out of the 80/443 port allowlist. Reserved for compile-time-fixed
   *  provider endpoints on non-standard ports (e.g. the ONE daily-quote API
   *  on :8000) — never set it for a user-influenced URL. Applies to the
   *  redirect hops too. */
  allowNonStandardPort?: boolean
  /**
   * Exact origin (`https://host[:port]`) of a fixed, admin-validated backend —
   * e.g. the self-hosted OpenObserve endpoint from the `observability`
   * settings. Only a request whose origin EQUALS this value bypasses the
   * private-host blocklist and the port allowlist, including at connect-time
   * DNS validation; every redirect target to another origin is still fully
   * guarded. Never derive it from an inbound request or a redirect Location.
   */
  trustedOrigin?: string
  /** Closed telemetry operation name. The URL/host/query are never
   *  recorded; omit and the span uses the fixed `unspecified` label. */
  operation?: SafeFetchOperation
}

export type SafeFetchFailureReason =
  | 'invalid-url'
  | 'bad-protocol'
  | 'bad-port'
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
  status: number | null
  error: unknown
}

export interface SafeFetchSuccess {
  ok: true
  url: string
  /** The final response. Its body has already been buffered into `body`,
   *  so read the bytes from there, not from the response. */
  response: Response
  body: ArrayBuffer
}

export interface SafeFetchStreamSuccess {
  ok: true
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

function bareHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function noAddressError(host: string): Error {
  return new Error(`safeFetch: DNS returned no address for ${host}`)
}

function blockedAddressError(host: string, address: string): Error {
  return new Error(`safeFetch: ${host} resolves to a blocked address (${address})`)
}

function familyNumber(family: LookupOptions['family']): number {
  if (family === 'IPv4') {
    return 4
  }
  if (family === 'IPv6') {
    return 6
  }
  return family ?? 0
}

async function resolveForDial(
  host: string,
  family: number,
  hints: number,
  validate: boolean,
): Promise<LookupAddress[]> {
  const addresses = await lookup(host, { all: true, family, hints })
  if (addresses.length === 0) {
    throw noAddressError(host)
  }
  if (validate) {
    for (const { address } of addresses) {
      if (isBlockedFetchHost(address)) {
        throw blockedAddressError(host, address)
      }
    }
  }
  return addresses
}

export function createDialLookup(allowPrivateHostnames?: ReadonlySet<string>): LookupFunction {
  return (hostname, options, callback) => {
    const bare = bareHostname(hostname)
    const trusted = allowPrivateHostnames?.has(bare.toLowerCase()) === true
    const literal = isIP(bare)
    if (literal !== 0) {
      if (!trusted && isBlockedFetchHost(bare)) {
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
        const addresses = await resolveForDial(bare, familyNumber(options.family), options.hints ?? 0, !trusted)
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

async function guardTarget(
  parsed: URL,
  url: string,
  allowNonStandardPort: boolean,
  trustedOrigin: string | undefined,
): Promise<SafeFetchFailure | null> {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure('bad-protocol', url)
  }
  if (trustedOrigin !== undefined && parsed.origin === trustedOrigin) {
    return null
  }
  if (!allowNonStandardPort && parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
    return failure('bad-port', url)
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    return failure('blocked-host', url)
  }
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

async function performSafeFetch(
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
    allowNonStandardPort = false,
    trustedOrigin,
  } = options

  const initial = tryParseUrl(url)
  if (initial === null) {
    return failure('invalid-url', url)
  }
  const initialRejection = await guardTarget(initial, url, allowNonStandardPort, trustedOrigin)
  if (initialRejection !== null) {
    return initialRejection
  }

  const trustedHostname =
    trustedOrigin === undefined ? undefined : new Set([bareHostname(new URL(trustedOrigin).hostname).toLowerCase()])

  const agent = new Agent({ connect: { lookup: createDialLookup(trustedHostname) } })
  let agentOwnedByStream = false

  try {
    let currentUrl = url
    let hopMethod = method
    let hopBody = body
    let hopHeaders = headers
    let response: Response
    for (let hop = 0; ; hop++) {
      try {
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
      const hopRejection = await guardTarget(nextUrl, nextUrl.toString(), allowNonStandardPort, trustedOrigin)
      if (hopRejection !== null) {
        return hopRejection
      }
      if (shouldFollowRedirect !== undefined && !shouldFollowRedirect(nextUrl)) {
        return failure('redirect-vetoed', nextUrl.toString())
      }
      // Fetch spec: 303 (and 301/302 for POST) become a bodiless GET; 307/308 carry forward.
      const becomesGet =
        response.status === 303 || ((response.status === 301 || response.status === 302) && hopMethod === 'POST')
      if (becomesGet) {
        hopMethod = 'GET'
        hopBody = undefined
      }
      const crossOrigin = nextUrl.origin !== new URL(currentUrl).origin
      if ((becomesGet || crossOrigin) && hopHeaders !== undefined) {
        hopHeaders = Object.fromEntries(
          Object.entries(hopHeaders).filter(([name]) => {
            const lower = name.toLowerCase()
            if (becomesGet && (lower === 'content-type' || lower === 'content-length')) {
              return false
            }
            if (crossOrigin && (lower === 'authorization' || lower === 'cookie' || lower === 'referer')) {
              return false
            }
            return true
          }),
        )
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

export function safeFetch(url: string, options: SafeFetchOptions & { stream: true }): Promise<SafeFetchStreamResult>
export function safeFetch(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult>
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult | SafeFetchStreamResult> {
  if (!isTraceActive()) {
    return performSafeFetch(url, options)
  }

  return withSpanAsync(
    'http.client',
    {
      kind: 'client',
      attributes: {
        'http.request.method': options.method ?? 'GET',
        'http.client.operation': options.operation ?? 'unspecified',
      },
    },
    async (span) => {
      const result = await performSafeFetch(url, options)
      if (result.ok) {
        span.setAttribute('http.response.status_code', result.response.status)
        span.setStatus('ok')
        return result
      }
      if (result.status !== null) {
        span.setAttribute('http.response.status_code', result.status)
      }
      span.setAttribute('error.category', `http_client_${result.reason.replaceAll('-', '_')}`)
      span.setStatus('error')
      return result
    },
  )
}

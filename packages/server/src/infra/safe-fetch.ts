import type { SafeFetchOperation } from '@kobato/server/infra/trace/sanitize'
import type { LookupAddress, LookupOptions } from 'node:dns'

import { isBlockedFetchHost } from '@kobato/auth/network'
import { isTraceActive, withSpanAsync } from '@kobato/server/infra/trace/facade'
import { tryParseUrl } from '@kobato/utils/safe-url'
import { lookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import { Agent } from 'undici'

export const SAFE_FETCH_DEFAULT_TIMEOUT_MS = 10_000
export const SAFE_FETCH_DEFAULT_MAX_REDIRECTS = 5

type TestDnsLookup = (host: string) => Promise<LookupAddress[]>

let lookupForTests: TestDnsLookup | null = null

export function __setDnsLookupForTests(fn: TestDnsLookup | null): void {
  lookupForTests = fn
}

export interface SafeFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  headers?: Record<string, string>
  maxRedirects?: number
  shouldFollowRedirect?: (nextUrl: URL) => boolean
  method?: string
  body?: string
  stream?: boolean
  allowNonStandardPort?: boolean
  trustedOrigin?: string
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
  url: string
  status: number | null
  error: unknown
}

export interface SafeFetchSuccess {
  ok: true
  url: string
  response: Response
  body: ArrayBuffer
}

export interface SafeFetchStreamSuccess {
  ok: true
  url: string
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
  const addresses =
    lookupForTests !== null ? await lookupForTests(host) : await lookup(host, { all: true, family, hints })
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
    addresses = lookupForTests !== null ? await lookupForTests(bare) : await lookup(bare, { all: true })
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

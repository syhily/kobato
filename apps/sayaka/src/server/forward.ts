import type { Env } from '@sayaka/server/hono-env'
import type { Context } from 'hono'

import { boundedUpstreamSignal, requestTimeoutMsForUrl } from '@kobato/api/client/request-timeout'
import { sayakaConfig } from '@sayaka/server/config'
import { getLogger } from '@sayaka/server/logger'
import { getDirectRemoteAddress, visitorAddress } from '@sayaka/server/visitor-address'
import { createMiddleware } from 'hono/factory'

const log = getLogger('forward')

const FORWARDED_FAMILIES = ['/rpc', '/admin', '/editor'] as const

export function isForwardedPath(path: string): boolean {
  return FORWARDED_FAMILIES.some((family) => path === family || path.startsWith(`${family}/`))
}

const STRIPPED_REQUEST_HEADERS = new Set([
  'forwarded',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'accept-encoding',
])

const STRIPPED_REQUEST_HEADER_PREFIXES = ['x-forwarded-'] as const

function connectionTokens(headers: Headers): Set<string> {
  const tokens = new Set<string>()
  const connection = headers.get('connection')
  if (connection !== null) {
    for (const token of connection.split(',')) {
      const trimmed = token.trim().toLowerCase()
      if (trimmed !== '') {
        tokens.add(trimmed)
      }
    }
  }
  return tokens
}

export function buildForwardedRequestHeaders(request: Request, clientAddress: string | undefined): Headers {
  const hopByHop = connectionTokens(request.headers)
  const headers = new Headers()
  request.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (
      lower === 'connection' ||
      STRIPPED_REQUEST_HEADERS.has(lower) ||
      STRIPPED_REQUEST_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
      hopByHop.has(lower)
    ) {
      return
    }
    headers.append(name, value)
  })
  headers.set('accept-encoding', 'identity')
  if (clientAddress !== undefined) {
    headers.set('x-forwarded-for', clientAddress)
  }
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(/:$/, ''))
  return headers
}

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
])

export function stripHopByHopResponseHeaders(upstream: Headers): Headers {
  const hopByHop = connectionTokens(upstream)
  const headers = new Headers()
  upstream.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower === 'set-cookie' || HOP_BY_HOP_RESPONSE_HEADERS.has(lower) || hopByHop.has(lower)) {
      return
    }
    headers.append(name, value)
  })
  for (const cookie of upstream.getSetCookie()) {
    headers.append('set-cookie', cookie)
  }
  return headers
}

export async function forwardToKobato(c: Context<Env>): Promise<Response> {
  const inbound = new URL(c.req.raw.url)
  const target = `${sayakaConfig.kobatoOrigin}${inbound.pathname}${inbound.search}`
  const clientAddress = visitorAddress(c.req.raw, getDirectRemoteAddress(c), sayakaConfig.trustedProxies)
  const bounded = boundedUpstreamSignal(
    c.req.raw.signal,
    requestTimeoutMsForUrl(inbound.pathname, sayakaConfig.kobatoTimeoutMs),
  )
  const init: RequestInit & { duplex?: 'half' } = {
    method: c.req.raw.method,
    headers: buildForwardedRequestHeaders(c.req.raw, clientAddress),
    redirect: 'manual',
    signal: bounded.signal,
  }
  if (c.req.raw.method !== 'GET' && c.req.raw.method !== 'HEAD' && c.req.raw.body !== null) {
    init.body = c.req.raw.body
    init.duplex = 'half'
  }
  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (error) {
    log.error('kobato upstream unreachable', {
      target,
      timedOut: bounded.timedOut,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.text(bounded.timedOut ? 'Gateway Timeout' : 'Bad Gateway', bounded.timedOut ? 504 : 502)
  } finally {
    bounded.release()
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: stripHopByHopResponseHeaders(upstream.headers),
  })
}

export const forwardKobatoFamilies = createMiddleware<Env>(async (c, next) => {
  if (!isForwardedPath(c.req.path)) {
    return next()
  }
  return forwardToKobato(c)
})

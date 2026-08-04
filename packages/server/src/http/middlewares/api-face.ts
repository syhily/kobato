import type { Env } from '@kobato/server/http/context'

import { serverConfig } from '@kobato/server/infra/config'
import { tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'
import { createMiddleware } from 'hono/factory'

/**
 * Headless REST face perimeter (phase 0.6):
 *
 * 1. CORS — anonymous reads answer `Access-Control-Allow-Origin: *`
 *    (public content, no credentials); credentialed writes require the
 *    Origin to be listed in `api.allowedOrigins` (explicit credentials,
 *    never a relaxed same-origin policy).
 * 2. Read rate limit — the loose per-IP budget from
 *    `api.readRateLimitPerMinute` (0 disables). `api.trustedProxy`
 *    addresses (the official frontend's server, trusted third-party
 *    frontends) are exempt — their SSR reads all arrive from one IP and
 *    must not be counted per visitor.
 *
 * The trusted-proxy exemption only applies to this read face; the write
 * chain honours `X-Forwarded-*` only behind a valid frontend key
 * (phase 0.6 proxy contract).
 */

/**
 * Trusted-proxy matching: exact IP, plain dot-prefix (`10.0.`), or IPv4
 * CIDR (`10.0.0.0/8`). The config schema advertises CIDR-ish prefixes, so
 * all three forms must actually match — `startsWith` alone silently
 * exempts nothing for a `10.0.0.0/8` entry.
 */
export function isTrustedProxy(clientAddress: string, entry: string): boolean {
  if (clientAddress === entry || clientAddress.startsWith(entry)) {
    return true
  }
  const slash = entry.indexOf('/')
  if (slash === -1) {
    return false
  }
  const network = entry.slice(0, slash)
  const bits = Number(entry.slice(slash + 1))
  const ip = clientAddress.split('.').map(Number)
  const net = network.split('.').map(Number)
  if (ip.length !== 4 || net.length !== 4 || ip.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false
  }
  if (net.some((o) => !Number.isInteger(o) || o < 0 || o > 255) || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false
  }
  let remaining = bits
  for (let i = 0; i < 4; i++) {
    const mask = remaining >= 8 ? 0xff : remaining <= 0 ? 0 : (0xff << (8 - remaining)) & 0xff
    if ((ip[i]! & mask) !== (net[i]! & mask)) {
      return false
    }
    remaining = Math.max(0, remaining - 8)
  }
  return true
}

export function apiFaceMiddleware() {
  return createMiddleware<Env>(async (c, next) => {
    const { allowedOrigins, trustedProxy, readRateLimitPerMinute } = serverConfig.api

    const origin = c.req.header('Origin')
    const method = c.req.method

    if (method === 'OPTIONS') {
      // CORS preflight — answer with the allowed headers; the actual
      // origin check happens on the write itself.
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
      c.header(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-Kobato-Comment-Token,X-Kobato-Session-Token',
      )
      if (origin !== undefined && allowedOrigins.includes(origin)) {
        c.header('Access-Control-Allow-Origin', origin)
        c.header('Access-Control-Allow-Credentials', 'true')
      }
      return c.body(null, 204)
    }

    if (method === 'GET' || method === 'HEAD') {
      // Anonymous reads — open CORS, no credentials.
      c.header('Access-Control-Allow-Origin', '*')
      if (readRateLimitPerMinute > 0) {
        const clientAddress = c.var.requestContext.clientAddress
        const exempt = trustedProxy.some((entry: string) => isTrustedProxy(clientAddress, entry))
        if (!exempt) {
          const { exceeded } = await tryKeyedRateLimit(`api-read:${clientAddress}`, {
            windowSeconds: 60,
            maxAttempts: readRateLimitPerMinute,
          })
          if (exceeded) {
            return c.json(
              { defined: false, code: 'TOO_MANY_REQUESTS', status: 429, message: '请求过于频繁，请稍后再试。' },
              429,
            )
          }
        }
      }
    } else {
      // Credentialed write — origin must be explicitly allowed.
      if (origin !== undefined && allowedOrigins.includes(origin)) {
        c.header('Access-Control-Allow-Origin', origin)
        c.header('Access-Control-Allow-Credentials', 'true')
      } else if (origin !== undefined) {
        return c.json({ defined: false, code: 'FORBIDDEN', status: 403, message: 'Origin 不在允许列表' }, 403)
      }
    }

    await next()
  })
}

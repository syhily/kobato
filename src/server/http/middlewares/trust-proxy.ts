import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const VALID_PROTOCOLS = new Set(['http', 'https'])

function readForwardedProto(header: string | null): string | null {
  if (!header) {
    return null
  }
  // RFC 7239: `Forwarded: for=…;proto=https;host=…`, possibly several hops.
  const firstHop = header.split(',')[0] ?? ''
  for (const pair of firstHop.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) {
      continue
    }
    if (pair.slice(0, eq).trim().toLowerCase() === 'proto') {
      return pair
        .slice(eq + 1)
        .trim()
        .replace(/^"|"$/g, '')
        .toLowerCase()
    }
  }
  return null
}

function readHeaderProto(c: { req: { header(name: string): string | undefined } }): string | null {
  const xForwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (xForwardedProto && VALID_PROTOCOLS.has(xForwardedProto)) {
    return xForwardedProto
  }
  const forwarded = readForwardedProto(c.req.header('forwarded') ?? null)
  return forwarded && VALID_PROTOCOLS.has(forwarded) ? forwarded : null
}

// The bundle snapshot object is stable between settings saves — memoize the
// gate decision on its identity instead of re-parsing the website URL per request.
let cachedBundle: object | null = null
let cachedGate: { host: string } | null = null

/**
 * The trust gate: an https `siteIdentity.website` declares a TLS-terminating
 * proxy in front (the node process only ever listens plain http), so proxy
 * scheme headers describe the real client-facing scheme and may be trusted.
 * Returns the canonical host for the headerless fallback, null when untrusted.
 */
function trustProxyGate(): { host: string } | null {
  const bundle = getBlogSettingsBundleSync()
  if (bundle === cachedBundle) {
    return cachedGate
  }
  cachedBundle = bundle
  const website = bundle?.siteIdentity?.website
  const parsed = website ? URL.parse(website) : null
  cachedGate = parsed?.protocol === 'https:' ? { host: parsed.host } : null
  return cachedGate
}

/**
 * Trust-proxy scheme fix. TLS-terminating proxies (Zeabur, nginx, …) forward
 * plain HTTP, so `@hono/node-server` builds `request.url` with `http:` while
 * the browser's `Origin` is `https:` — React Router 8.3.1+'s
 * `throwIfPotentialCSRFAttack` then rejects every `.data` action POST with
 * "Bad Request". When the gate is on, rewrite the request URL to the public
 * scheme: the proxy's `X-Forwarded-Proto` / RFC 7239 `Forwarded` header when
 * present, else `https` when the request addresses the canonical host (TLS
 * termination is then logically entailed — an https site cannot be served by
 * this plain-http listener directly).
 *
 * With an http/absent website the headers are ignored: direct http access
 * (dev, LAN) needs no fix, and a spoofed header gains a direct client nothing.
 */
export const trustProxy = createMiddleware<Env>(async (c, next) => {
  const gate = trustProxyGate()
  if (gate !== null) {
    const url = new URL(c.req.raw.url)
    const proto = readHeaderProto(c) ?? (url.host === gate.host ? 'https' : null)
    if (proto !== null && url.protocol !== `${proto}:`) {
      url.protocol = `${proto}:`
      // Rebuild via a plain init object — `new Request(request, …)` trips on
      // foreign-realm Request instances under the vite dev server.
      const init: RequestInit & { duplex?: 'half' } = {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        redirect: 'manual',
      }
      if (c.req.raw.body !== null) {
        init.body = c.req.raw.body
        init.duplex = 'half'
      }
      c.req.raw = new Request(url, init)
    }
  }
  return next()
})

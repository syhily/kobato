import type { Env } from '@kobato/server/http/hono-env'

import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { createMiddleware } from 'hono/factory'

const VALID_PROTOCOLS = new Set(['http', 'https'])

function readForwardedProto(header: string | null): string | null {
  if (!header) {
    return null
  }
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

let cachedBundle: object | null = null
let cachedGate: { host: string } | null = null

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

export const trustProxy = createMiddleware<Env>(async (c, next) => {
  const gate = trustProxyGate()
  if (gate !== null) {
    const url = new URL(c.req.raw.url)
    const proto = readHeaderProto(c) ?? (url.host === gate.host ? 'https' : null)
    if (proto !== null && url.protocol !== `${proto}:`) {
      url.protocol = `${proto}:`
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

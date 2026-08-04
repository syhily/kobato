import type { Env } from '@kobato/server/http/context'

import { serve, type ServerType } from '@hono/node-server'
import { onErrorHandler } from '@kobato/server/http/errors'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { assetsRouter } from '@kobato/server/http/resources/assets'
import { feedRouter } from '@kobato/server/http/resources/feed'
import { fontsEmbeddedRouter } from '@kobato/server/http/resources/fonts-embedded'
import { imagesRouter } from '@kobato/server/http/resources/images'
import { localStorageRouter } from '@kobato/server/http/resources/local-storage'
import { redirectsRouter } from '@kobato/server/http/resources/redirects'
import { sitemapRouter } from '@kobato/server/http/resources/sitemap'
import { webmentionRouter } from '@kobato/server/http/resources/webmention'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createUrlProxyApp } from '@/lib/http/proxy-routes'
import { frontendWpDecoyMiddleware } from '@/lib/http/wp-decoy'

// ─── URL-endpoint parity over REAL HTTP ────────────────────────────
//
// Core's resource routers (the same modules the production pipeline
// mounts) served on an ephemeral port; the frontend proxy table mounted
// on top of them. Every representative endpoint of the mount table is
// fetched BOTH ways — core directly, and through the frontend proxy —
// and the responses must match in status and content-type, with the
// representative semantics (304/206/redirects) asserted concretely.
//
// This is the round-trip proof of the phase-2 contract: a third party
// hitting the frontend's canonical domain gets byte-identical
// endpoints to a core-direct call.

// ── core: real resource routers over HTTP on an ephemeral port ──
let coreServer: ServerType
let coreUrl: string
let frontendApp: Hono

async function waitForPort(server: ServerType): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const addr = server.address()
    if (addr !== null && typeof addr === 'object') {
      return `http://127.0.0.1:${addr.port}`
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('core test server never bound a port')
}

beforeAll(async () => {
  // The same middleware surface the production pipeline gives these
  // routers: request-id (for the error handler), request context (for
  // `c.var.requestContext.db` + the rate-limit client address), and the
  // error handler (HTTPException → 404 etc.).
  const coreApp = new Hono<Env>()
  coreApp.onError(onErrorHandler)
  coreApp.use(requestId())
  coreApp.use('*', requestContextMiddleware)
  coreApp.route('/', feedRouter)
  coreApp.route('/', assetsRouter)
  coreApp.route('/', imagesRouter)
  coreApp.route('/', localStorageRouter)
  coreApp.route('/', fontsEmbeddedRouter)
  coreApp.route('/', sitemapRouter)
  coreApp.route('/', redirectsRouter)
  coreApp.route('/', webmentionRouter)
  coreServer = serve({ fetch: coreApp.fetch.bind(coreApp), port: 0 })
  coreUrl = await waitForPort(coreServer)

  // ── frontend: the production proxy table pointed at core ──
  frontendApp = new Hono()
  frontendApp.use(frontendWpDecoyMiddleware)
  frontendApp.route('/', createUrlProxyApp({ coreApiUrl: coreUrl, privateKeyPem: null, keyId: null }))

  // ── a real local-storage media file for /storage/* parity ──
  const storageDir = join(process.env['storage__data'] ?? '/tmp/kobato-data', 'storage', 'images')
  mkdirSync(storageDir, { recursive: true })
  writeFileSync(join(storageDir, 'it-parity.png'), Buffer.from('fake-png-bytes-0123456789'))
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    coreServer.close((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
  rmSync(join(process.env['storage__data'] ?? '/tmp/kobato-data', 'storage', 'images', 'it-parity.png'), {
    force: true,
  })
})

interface ParityCase {
  name: string
  path: string
  method?: 'GET' | 'HEAD' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** The concrete status core must answer (null = assert parity only). */
  expectStatus?: number
}

const CASES: ParityCase[] = [
  // Feeds (6 of them; two site-wide + one category + one tag representative).
  { name: 'site feed RSS', path: '/feed', expectStatus: 200 },
  { name: 'site feed Atom', path: '/feed/atom', expectStatus: 200 },
  { name: 'category feed', path: '/cats/general/feed', expectStatus: 200 },
  { name: 'category feed Atom', path: '/cats/general/feed/atom', expectStatus: 200 },
  { name: 'tag feed', path: '/tags/typescript/feed', expectStatus: 200 },
  { name: 'tag feed Atom', path: '/tags/typescript/feed/atom', expectStatus: 200 },
  // SEO / PWA.
  { name: 'sitemap', path: '/sitemap.xml', expectStatus: 200 },
  { name: 'robots', path: '/robots.txt', expectStatus: 200 },
  { name: 'webmanifest', path: '/manifest.webmanifest', expectStatus: 200 },
  // Brand assets (representatives of the 14).
  { name: 'favicon.svg', path: '/favicon.svg', expectStatus: 200 },
  { name: 'logo.svg', path: '/logo.svg', expectStatus: 200 },
  { name: 'favicon.ico', path: '/favicon.ico', expectStatus: 200 },
  { name: 'icon-192.png', path: '/images/icon-192.png', expectStatus: 200 },
  { name: 'open-graph.png', path: '/images/open-graph.png', expectStatus: 200 },
  { name: 'brand asset ?original', path: '/logo.svg?original', expectStatus: 200 },
  // Generated images.
  { name: 'og fallback (unknown post)', path: '/images/og/nope.png', expectStatus: 302 },
  { name: 'og/cats fallback', path: '/images/og/cats/nope.png', expectStatus: 302 },
  { name: 'calendar invalid (no render)', path: '/images/calendar/999/0101.png', expectStatus: 404 },
  { name: 'calendar dark invalid (no render)', path: '/images/calendar/dark/999/0101.png', expectStatus: 404 },
  { name: 'avatar garbage hash → default redirect', path: '/images/avatar/garbage.png', expectStatus: 302 },
  // Local storage media.
  { name: 'storage media 200', path: '/storage/images/it-parity.png', expectStatus: 200 },
  {
    name: 'storage media range 206',
    path: '/storage/images/it-parity.png',
    headers: { Range: 'bytes=0-3' },
    expectStatus: 206,
  },
  { name: 'storage media 304 (etag round-trip)', path: '/storage/images/it-parity.png', expectStatus: 304 },
  { name: 'storage missing 404', path: '/storage/images/nope.png', expectStatus: 404 },
  { name: 'storage private namespace 404', path: '/storage/backup/x.tar.gz', expectStatus: 404 },
  // Embedded fonts.
  {
    name: 'embedded font 404 (unknown hash file)',
    path: `/fonts/embedded/${'a'.repeat(64)}/x.woff2`,
    expectStatus: 404,
  },
  { name: 'embedded font 400 (bad hash)', path: '/fonts/embedded/bad/x.woff2', expectStatus: 400 },
  // Legacy redirects (local replicates).
  { name: '/tags → /', path: '/tags', expectStatus: 301 },
  { name: '/search?q= → /search/<q>', path: '/search?q=hello%20world', expectStatus: 301 },
  { name: '/search without q → /', path: '/search', expectStatus: 301 },
  // Webmention receive.
  { name: 'webmention empty body 400', path: '/webmention', method: 'POST', expectStatus: 400 },
  {
    name: 'webmention oversized body 413',
    path: '/webmention',
    method: 'POST',
    body: 'a'.repeat(16 * 1024 + 1),
    expectStatus: 413,
  },
]

describe('URL-endpoint proxy parity (frontend ⇄ core)', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const init = {
        method: testCase.method ?? 'GET',
        headers: testCase.headers,
        body: testCase.body,
      }

      // First fetch the etag for the 304 case — the media file's etag
      // derives from size+mtime, so it must be read at request time.
      const conditional = testCase.expectStatus === 304 ? await readStorageEtag() : undefined

      // Core-direct fetch with `redirect: 'manual'` — same relay policy
      // as the frontend proxy, so 3xx responses are compared as-is
      // instead of being followed to their targets.
      const coreRes = await fetch(`${coreUrl}${testCase.path}`, {
        ...init,
        redirect: 'manual',
        headers: { ...init.headers, ...(conditional ? { 'If-None-Match': conditional } : {}) },
      })
      const proxiedRes = await frontendApp.request(testCase.path, {
        ...init,
        headers: { ...init.headers, ...(conditional ? { 'If-None-Match': conditional } : {}) },
      })

      // Parity: the proxied response equals the core-direct one in
      // status and content-type — the canonical-domain promise.
      expect(proxiedRes.status, `${testCase.path} status`).toBe(coreRes.status)
      expect(proxiedRes.headers.get('content-type'), `${testCase.path} content-type`).toBe(
        coreRes.headers.get('content-type'),
      )

      if (testCase.expectStatus !== undefined) {
        expect(coreRes.status, `${testCase.path} core status`).toBe(testCase.expectStatus)
      }

      // Redirect parity: the location must survive the relay verbatim.
      if (coreRes.status >= 300 && coreRes.status < 400) {
        expect(proxiedRes.headers.get('location'), `${testCase.path} location`).toBe(coreRes.headers.get('location'))
      }
    })
  }

  it('streams a storage file body through unchanged', async () => {
    const coreRes = await fetch(`${coreUrl}/storage/images/it-parity.png`)
    const proxiedRes = await frontendApp.request('/storage/images/it-parity.png')

    expect(await proxiedRes.text()).toBe(await coreRes.text())
  })
})

/** Read the storage media file's etag the way core computes it
 *  (size-mtime, quoted) — the 304 case must present a matching
 *  If-None-Match. */
async function readStorageEtag(): Promise<string> {
  const res = await fetch(`${coreUrl}/storage/images/it-parity.png`)
  const etag = res.headers.get('etag')
  if (etag === null) {
    throw new Error('core did not answer the storage probe with an etag')
  }
  return etag
}

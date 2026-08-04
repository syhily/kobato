import type { Env } from '@kobato/server/http/context'
import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { StatusCode } from 'hono/utils/http-status'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { serve, type ServerType } from '@hono/node-server'
import { apiRouter } from '@kobato/server/http/api-router'
import { onErrorHandler } from '@kobato/server/http/errors'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { feedRouter } from '@kobato/server/http/resources/feed'
import { webmentionRouter } from '@kobato/server/http/resources/webmention'
import { post } from '@kobato/server/infra/db/schema/post'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createUrlProxyApp } from '@/lib/http/proxy-routes'
import { createWebmentionLinkMiddleware } from '@/lib/http/webmention-link'

// ─── Webmention end-to-end over REAL HTTP ──────────────────────────
//
// The two-service topology's webmention surfaces, both directions:
//
//   - DISCOVERY (this file's frontend side): core's real `/rpc` handler
//     (the `layout` procedure over the oRPC RPC wire) served on an
//     ephemeral port; the frontend's `createWebmentionLinkMiddleware`
//     pointed at it, answering HTML pages. The `Link: rel="webmention"`
//     header must appear on HTML responses and never on proxied
//     non-HTML endpoints (feeds). This is the round-trip proof that the
//     middleware's lazy layout fetch survives the real wire: the oRPC
//     envelope (`{ json: <data> }`) — a top-level `blogSettings` read
//     would silently miss and the header would never be emitted.
//
//   - RECEIVE (through the frontend's POST proxy): the 202 accept /
//     410 gone semantics over the real proxy chain, complementing the
//     parity test's 400/413 cases. The receive switch is flipped by
//     seeding the in-process settings snapshot exactly like the
//     server-side resource tests do.

// ── core: the real RPC handler + resource routers over HTTP ──
let coreServer: ServerType
let coreUrl: string

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

const db = getTestDb()

beforeAll(async () => {
  const rpcHandler = new RPCHandler(apiRouter)

  const coreApp = new Hono<Env>()
  coreApp.onError(onErrorHandler)
  coreApp.use(requestId())
  coreApp.use('*', requestContextMiddleware)
  // The `/rpc/*` bridge — the same HandlerContext projection core's
  // production `app.ts` performs (minus the CSRF guard; the layout
  // procedure is a safe-method read and the test client carries no
  // cookies either way).
  coreApp.use('/rpc/*', async (c, next) => {
    const rc = c.var.requestContext
    const context: HandlerContext = {
      request: c.req.raw,
      requestFacts: rc.requestFacts,
      session: rc.session,
      viewer: rc.viewer,
      clientAddress: rc.clientAddress,
      responseHeaders: new Headers(),
      db: rc.db,
    }
    const result = await rpcHandler.handle(c.req.raw, { prefix: '/rpc', context })
    if (!result.matched) {
      await next()
      return
    }
    return c.newResponse(result.response.body, {
      status: unsafeCast<StatusCode>(result.response.status),
      headers: result.response.headers,
    })
  })
  coreApp.route('/', feedRouter)
  coreApp.route('/', webmentionRouter)

  coreServer = serve({ fetch: coreApp.fetch.bind(coreApp), port: 0 })
  coreUrl = await waitForPort(coreServer)
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
})

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

// A fresh frontend app per test: the middleware's layout cache is a
// module-level closure (60 s positive TTL), so tests flipping the
// receive switch must not inherit an earlier test's cached entry.
function buildFrontendApp(): Hono {
  const app = new Hono()
  app.use(createWebmentionLinkMiddleware(coreUrl))
  app.route('/', createUrlProxyApp({ coreApiUrl: coreUrl, privateKeyPem: null, keyId: null }))
  // The one HTML surface the frontend itself renders (page routes) —
  // proxied endpoints (feeds, sitemap, …) are never HTML.
  app.get('/page', (c) => c.html('<html><body>hi</body></html>'))
  return app
}

function webmentionPost(app: Hono, params: Record<string, string>) {
  return app.request('/webmention', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
}

describe('webmention Link header (frontend middleware ⇄ real core layout RPC)', () => {
  it('emits the Link header on HTML pages while the receive switch is on', async () => {
    const app = buildFrontendApp()

    const res = await app.request('/page')

    expect(res.status).toBe(200)
    // `siteIdentity.website` of the seeded bundle is `https://example.com`.
    expect(res.headers.get('Link')).toBe('<https://example.com/webmention>; rel="webmention"')
  })

  it('suppresses the header when the receive switch is off', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: false, displayOnPosts: true } },
    })
    const app = buildFrontendApp()

    const res = await app.request('/page')

    expect(res.status).toBe(200)
    expect(res.headers.get('Link')).toBeNull()
  })

  it('does not decorate proxied non-HTML responses (feed)', async () => {
    const app = buildFrontendApp()

    const res = await app.request('/feed')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('xml')
    expect(res.headers.get('Link')).toBeNull()
  })
})

describe('webmention receive through the frontend POST proxy (real chain)', () => {
  it('answers 202 for a valid source/target pair', async () => {
    await db
      .insert(post)
      .values({ slug: 'wm-target', title: 'Mentioned Post', published: true, publishedRevisionId: 1 })
      .returning({ id: post.id })
    const app = buildFrontendApp()

    const res = await webmentionPost(app, {
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'pending' })
  })

  it('answers 410 Gone when receiving is disabled', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: false, displayOnPosts: true } },
    })
    const app = buildFrontendApp()

    const res = await webmentionPost(app, {
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })

    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: { message: 'This endpoint no longer accepts webmentions' } })
  })
})

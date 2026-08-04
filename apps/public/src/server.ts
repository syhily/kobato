import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/shared/sea/assets'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { getMimeType } from 'hono/utils/mime'
import { randomBytes } from 'node:crypto'
import { RouterContextProvider, createRequestHandler } from 'react-router'

import { frontendContext } from '@/lib/frontend-context'
import { createUrlProxyApp } from '@/lib/http/proxy-routes'
import { createRpcProxy } from '@/lib/http/rpc-proxy'
import { createWebmentionLinkMiddleware } from '@/lib/http/webmention-link'
import { frontendWpDecoyMiddleware } from '@/lib/http/wp-decoy'
import { root } from '@/lib/logger'
import { getEmbeddedAsset, isSea } from '@/lib/sea-assets'

// ─── Frontend (official public SSR service) assembly ─────
//
// The frontend binary serves the public pages and the site's canonical
// URL endpoints: no /rpc, no /api, no admin, no schedulers, no
// migrations, no database, no shared config graph. Content-shaped reads
// go over HTTP to the core server's Content API (the SDK client's HTTP
// transport — see `src/routes/public/client.ts`); the URL-shaped
// resources core generates (feeds, sitemap/robots/manifest, brand
// assets, OG/calendar/avatar images, /storage media, embedded fonts)
// are proxied to core with streaming relay (`src/lib/http/proxy-routes.ts`,
// pinned 1:1 against core's mounts by a contract test). This file owns
// the perimeter: the client-asset serving (disk / SEA embedded), the
// React Router request handler with the per-request frontend context,
// a health probe, the WordPress probe decoy, and the stage-3 write /
// webmention proxies.
//
// Configuration face is environment-only (the plan's frontend config
// contract): PORT (default 4322; `server__port` is honored as the harness
// convention from the SEA smoke lifecycle), CORE_API_URL (the core base
// URL for the SDK transport's `/rpc`, the URL-endpoint GET proxy, and
// the POST /webmention proxy; echoed by /health so deployments can
// verify the wiring), CORE_PUBLIC_URL (the browser-reachable core base
// URL, carried in the root loader data for the stage-3 write proxy), and
// the stage-3 write-proxy credentials KOBATO_FRONTEND_PRIVATE_KEY /
// KOBATO_FRONTEND_KEY_ID (the frontend's Ed25519 key pair for the
// comment-token / X-Forwarded-* trust chain — anonymous forwards work
// without them, but core then ignores every forwarding header).

const CORE_API_URL = process.env.CORE_API_URL ?? null
const CORE_PUBLIC_URL = process.env.CORE_PUBLIC_URL ?? null
const FRONTEND_PRIVATE_KEY = process.env.KOBATO_FRONTEND_PRIVATE_KEY ?? null
const FRONTEND_KEY_ID = process.env.KOBATO_FRONTEND_KEY_ID ?? null
const PORT = Number(process.env.PORT ?? process.env.server__port ?? 4322)

/** One-year browser cache for fingerprinted assets (mirrors the server package's `cache` middleware). */
const cache = (seconds: number) =>
  createMiddleware(async (c, next) => {
    if (!c.req.path.match(/\.[a-zA-Z0-9]+$/) || c.req.path.endsWith('.data')) {
      return next()
    }

    await next()

    if (!c.res.ok || c.res.headers.has('cache-control')) {
      return
    }

    c.res.headers.set('cache-control', `public, max-age=${seconds}`)
  })

/** SEA-mode replacement for `serveStatic` on the fingerprinted client
 *  assets: the frontend binary embeds its `build/client` tree, so files
 *  are read from memory instead of disk. A miss mirrors serveStatic's
 *  behavior (`next()`), letting later middleware handle it. */
const serveEmbeddedStatic = createMiddleware(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next()
  }
  // The handler only runs under the `/<assetsDir>/*` mount, so the
  // request path maps 1:1 onto the embedded `client/assets/...` keys
  // (the leading `/` of the path makes room for the prefix).
  const asset = getEmbeddedAsset(`${SEA_CLIENT_ASSET_PREFIX}${c.req.path.slice(1)}`)
  if (asset === null) {
    return next()
  }
  c.header('Content-Type', getMimeType(c.req.path) ?? 'application/octet-stream')
  c.header('Content-Length', String(asset.byteLength))
  if (c.req.method === 'HEAD') {
    return c.body(null, 200)
  }
  return c.body(new Uint8Array(asset), 200)
})

async function getLoadContext(): Promise<RouterContextProvider> {
  const context = new RouterContextProvider()
  context.set(frontendContext, {
    coreApiUrl: CORE_API_URL,
    corePublicUrl: CORE_PUBLIC_URL,
    // The frontend's own per-request nonce — there is no shared session to
    // derive one from (core's request-context middleware stays core-side).
    cspNonce: randomBytes(16).toString('base64'),
  })
  return context
}

const basename = String(import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME ?? '/')

const app = new Hono()

// Health probe: no install gate on the frontend — it always answers 200
// and reports the configured core URL (null when unset).
app.get('/health', (c) => c.json({ status: 'ok', coreApiUrl: CORE_API_URL }))

// Serve the fingerprinted client assets. Production only: in development
// Vite's dev server handles asset serving and `build/client` does not
// exist yet. The disk fallback serves from the built client tree; under
// SEA the tree is embedded in the binary.
if (import.meta.env.PROD) {
  const assetsPath = `/${import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR}/*`
  if (isSea()) {
    app.use(assetsPath, cache(60 * 60 * 24 * 365), serveEmbeddedStatic)
  } else {
    const clientBuildPath = `${import.meta.env.REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY}/client`
    app.use(assetsPath, cache(60 * 60 * 24 * 365), serveStatic({ root: clientBuildPath }))
  }
}

// WordPress probe decoy: answer scanner paths with the canonical
// `404 Not WordPress` BEFORE anything else (core parity — the decoy sits
// at the top of core's pipeline too). Under the headless topology the
// frontend is the first hop a probe touches; without this the request
// would burn an SSR round-trip or fall through to a generic 404.
app.use(frontendWpDecoyMiddleware)

// Same-origin `/rpc` write proxy (stage 3): the public pages' comment /
// like forms POST to the frontend's own `/rpc`, which forwards to core
// with the proxy header family (frontend JWT + comment-token jar +
// X-Forwarded-*). Registered BEFORE the React Router mount so the router
// never sees `/rpc` paths.
app.use(
  '/rpc/*',
  createRpcProxy({
    coreApiUrl: CORE_API_URL,
    privateKeyPem: FRONTEND_PRIVATE_KEY,
    keyId: FRONTEND_KEY_ID,
  }),
)

// Core-owned URL endpoints (feeds, sitemap/robots/manifest, brand
// assets, OG/calendar/avatar images, /storage media, embedded fonts)
// proxied to core with streaming relay — the mount table in
// `lib/http/proxy-routes.ts`, pinned 1:1 against core's resource routes
// by a contract test. Also serves the local 301 replicates (/tags,
// /search) and the POST /webmention proxy. Registered BEFORE the React
// Router mount so the router never sees these paths.
app.route(
  '/',
  createUrlProxyApp({ coreApiUrl: CORE_API_URL, privateKeyPem: FRONTEND_PRIVATE_KEY, keyId: FRONTEND_KEY_ID }),
)

// W3C webmention discovery for page responses: appends
// `Link: <core-origin>/webmention; rel="webmention"` to HTML responses
// while the receive switch is on (lazy layout-bundle fetch, 60 s TTL).
// Registered immediately before the router so it wraps the SSR face.
app.use(createWebmentionLinkMiddleware(CORE_API_URL))

// React Router request handler (the framework-mode SSR face).
const reactRouterApp = new Hono({ strict: false })
reactRouterApp.use(async (c, next) =>
  createMiddleware(async (ctx) => {
    const build = await import('virtual:react-router/server-build')
    const requestHandler = createRequestHandler(build, import.meta.env.PROD ? 'production' : 'development')
    const loadContext = await getLoadContext()
    return requestHandler(ctx.req.raw, loadContext)
  })(c, next),
)
app.route(basename, reactRouterApp)

// Patch https://github.com/remix-run/react-router/issues/12295
if (basename) {
  app.route(`${basename}.data`, reactRouterApp)
}

// ─── Start HTTP server ───────────────────────────────────

if (import.meta.env.PROD) {
  serve({ fetch: app.fetch.bind(app), port: PORT }, (info) => {
    root.info(`🚀 Frontend server started on port ${info.port}`)
    if (CORE_API_URL !== null) {
      root.info(`🌐 core API at ${CORE_API_URL}`)
    }
    if (FRONTEND_PRIVATE_KEY === null || FRONTEND_KEY_ID === null) {
      root.warn(
        '🔑 KOBATO_FRONTEND_PRIVATE_KEY / KOBATO_FRONTEND_KEY_ID not set — /rpc writes forward anonymously (no JWT trust, no comment-token continuity)',
      )
    }
  })
}

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app

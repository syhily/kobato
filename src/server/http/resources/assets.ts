import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { ASSET_ROUTES, resolveSiteAsset } from '@/server/domains/assets/service'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export const assetsRouter = new Hono<Env>()

const ASSET_CACHE_CONTROL = 'public, max-age=3600, must-revalidate'

// Branding bytes change whenever an admin uploads a new file, so we
// CANNOT serve `immutable`. We DO send an `ETag` keyed by the bytes'
// sha256 (computed once, either at module init for bundled defaults or
// at upload time for S3-backed branding). Combined with
// `must-revalidate`, the browser / CDN sends a conditional GET and we
// reply 304 when the bytes match — no body, no S3 fetch on the hot path.
for (const path of Object.keys(ASSET_ROUTES)) {
  assetsRouter.get(path, async (c) => {
    const resolved = await resolveSiteAsset(path)
    if (!resolved) {
      return c.body(null, 404)
    }
    const inm = c.req.header('if-none-match')
    const quoted = `"${resolved.etag}"`
    if (inm && (inm === quoted || inm === resolved.etag || inm === '*')) {
      c.header('ETag', quoted)
      c.header('Cache-Control', ASSET_CACHE_CONTROL)
      return c.body(null, 304)
    }
    c.header('Content-Type', resolved.contentType)
    c.header('Cache-Control', ASSET_CACHE_CONTROL)
    c.header('ETag', quoted)
    return c.body(new Uint8Array(resolved.content))
  })
}

// Hard-coded fallbacks for the two derived endpoints. The settings
// bundle may legitimately be `null` during early boot (the install
// gate hasn't run yet, or the snapshot loader is in flight) — these
// routes can be hit by uptime probes and "view manifest" devtools long
// before any admin has logged in. The bundled defaults are designed to
// keep the perimeter responsive in that window.
const DEFAULT_MANIFEST_NAME = 'Site'

assetsRouter.get('/manifest.webmanifest', async (c) => {
  const siteIdentity = getBlogSettingsBundleSync()?.siteIdentity
  const name = siteIdentity?.title || DEFAULT_MANIFEST_NAME
  c.header('Cache-Control', ASSET_CACHE_CONTROL)
  return c.json({
    name,
    short_name: name,
    icons: [
      { src: '/images/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/images/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    display: 'standalone',
    theme_color: '#ffffff',
    background_color: '#ffffff',
  })
})

assetsRouter.get('/robots.txt', async (c) => {
  const bundle = getBlogSettingsBundleSync()
  const custom = bundle?.assets?.branding?.robotsTxt
  let body: string
  if (typeof custom === 'string' && custom.length > 0) {
    body = custom
  } else {
    const website = bundle?.siteIdentity?.website ?? ''
    body = website ? `User-agent: *\nAllow: /\nSitemap: ${website}/sitemap.xml` : 'User-agent: *\nAllow: /\n'
  }
  c.header('Content-Type', 'text/plain; charset=utf-8')
  c.header('Cache-Control', ASSET_CACHE_CONTROL)
  return c.body(body)
})

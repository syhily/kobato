import type { Env } from '@kobato/server/http/hono-env'

import { ASSET_ROUTES, resolveSiteAsset } from '@kobato/server/domains/assets/services/routes'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { Hono } from 'hono'

export const assetsRouter = new Hono<Env>()

const ASSET_CACHE_CONTROL = 'public, max-age=3600, must-revalidate'
export const MANIFEST_CACHE_CONTROL = 'public, no-cache'

for (const path of Object.keys(ASSET_ROUTES)) {
  assetsRouter.get(path, async (c) => {
    const resolved = await resolveSiteAsset(path, { original: c.req.query('original') !== undefined })
    if (!resolved) {
      return c.body(null, 404)
    }
    const inm = c.req.header('if-none-match')
    const quoted = `"${resolved.etag}"`
    if (etagHeaderMatches(inm, quoted)) {
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

const DEFAULT_MANIFEST_NAME = 'Site'

assetsRouter.get('/manifest.webmanifest', async (c) => {
  const { settings: bundle, localization } = c.var.requestContext
  const siteIdentity = bundle?.siteIdentity
  const name = siteIdentity?.title || DEFAULT_MANIFEST_NAME
  const branding = bundle?.assets?.branding
  const locale = localization.locale
  const body = JSON.stringify({
    name,
    short_name: name,
    lang: locale,
    icons: [
      {
        src: `/images/icon-192.png${brandingVersionSuffix(branding?.icon192)}`,
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: `/images/icon-512.png${brandingVersionSuffix(branding?.icon512)}`,
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    display: 'standalone',
    theme_color: '#ffffff',
    background_color: '#ffffff',
  })
  const etag = contentEtag(body)
  c.header('Content-Type', 'application/json; charset=utf-8')
  c.header('Cache-Control', MANIFEST_CACHE_CONTROL)
  c.header('Content-Language', locale)
  c.header('ETag', etag)
  if (etagHeaderMatches(c.req.header('if-none-match'), etag)) {
    return c.body(null, 304)
  }
  return c.body(body)
})

assetsRouter.get('/robots.txt', async (c) => {
  const bundle = c.var.requestContext.settings
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

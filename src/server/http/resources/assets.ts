import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { ASSET_ROUTES, resolveSiteAsset } from '@/server/domains/assets/services/routes'
import { contentEtag, etagHeaderMatches } from '@/server/infra/http/etag'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { brandingVersionSuffix } from '@/shared/config/utils'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'

export const assetsRouter = new Hono<Env>()

const ASSET_CACHE_CONTROL = 'public, max-age=3600, must-revalidate'
/** The manifest embeds the UI language — stored but revalidated on every reuse. */
export const MANIFEST_CACHE_CONTROL = 'public, no-cache'

// Branding bytes change on re-upload — no `immutable`; ETag (sha256) +
// `must-revalidate` gives conditional 304s with no body/S3 fetch on the hot path.
for (const path of Object.keys(ASSET_ROUTES)) {
  assetsRouter.get(path, async (c) => {
    const resolved = await resolveSiteAsset(path, { original: c.req.query('original') !== undefined })
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

// Hard-coded fallbacks: the settings bundle may be `null` early in boot,
// and uptime probes hit these routes before any admin has logged in.
const DEFAULT_MANIFEST_NAME = 'Site'

assetsRouter.get('/manifest.webmanifest', async (c) => {
  const bundle = getBlogSettingsBundleSync()
  const siteIdentity = bundle?.siteIdentity
  const name = siteIdentity?.title || DEFAULT_MANIFEST_NAME
  const branding = bundle?.assets?.branding
  const locale = resolveAppLocalization().locale
  // Hand-built bytes: the ETag must hash the EXACT body we send — hashing the
  // object and re-serializing would drift on key order / spacing.
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

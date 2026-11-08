import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { through } from '@/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@/server/infra/http/etag'
import { buildSitemapXml } from '@/server/render/seo/sitemap'

/**
 * Stored but revalidated on every reuse: the XML embeds the site origin, and a
 * domain change must never be shadowed by a client max-age window.
 */
export const SITEMAP_CACHE_CONTROL = 'public, no-cache'

export const sitemapRouter = new Hono<Env>().get('/sitemap.xml', rateLimitByIp('sitemap', 'resource'), async (c) => {
  const { db, settings, localization } = c.var.requestContext
  const xml = await through(db, 'sitemap', { settingsRevision: localization.revisions.sitemap }, () =>
    buildSitemapXml(db, settings),
  )
  // Strong ETag over the exact bytes: a cache hit reuses the same XML, and the
  // 304 carries the representation headers it validates.
  const etag = contentEtag(xml)
  c.header('Content-Type', 'application/xml; charset=utf-8')
  c.header('Cache-Control', SITEMAP_CACHE_CONTROL)
  c.header('ETag', etag)
  if (etagHeaderMatches(c.req.header('if-none-match'), etag)) {
    return c.body(null, 304)
  }
  return c.body(xml)
})

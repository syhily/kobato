import type { Env } from '@kobato/server/http/hono-env'

import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit'
import { through } from '@kobato/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { buildSitemapXml } from '@kobato/server/render/seo/sitemap'
import { Hono } from 'hono'

export const SITEMAP_CACHE_CONTROL = 'public, no-cache'

export const sitemapRouter = new Hono<Env>().get('/sitemap.xml', rateLimitByIp('sitemap', 'resource'), async (c) => {
  const { db, settings, localization } = c.var.requestContext
  const xml = await through('sitemap', { settingsRevision: localization.revisions.sitemap }, () =>
    buildSitemapXml(db, settings),
  )
  const etag = contentEtag(xml)
  c.header('Content-Type', 'application/xml; charset=utf-8')
  c.header('Cache-Control', SITEMAP_CACHE_CONTROL)
  c.header('ETag', etag)
  if (etagHeaderMatches(c.req.header('if-none-match'), etag)) {
    return c.body(null, 304)
  }
  return c.body(xml)
})

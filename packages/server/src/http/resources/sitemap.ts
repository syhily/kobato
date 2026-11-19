import type { Env } from '@kobato/server/http/hono-env.ts'

import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit.ts'
import { through } from '@kobato/server/infra/cache/registry.ts'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag.ts'
import { buildSitemapXml } from '@kobato/server/render/seo/sitemap.ts'
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

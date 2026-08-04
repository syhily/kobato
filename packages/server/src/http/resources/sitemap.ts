import type { Env } from '@kobato/server/http/context'

import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit'
import { through } from '@kobato/server/infra/cache/registry'
import { buildSitemapXml } from '@kobato/server/render/seo/sitemap'
import { Hono } from 'hono'

export const sitemapRouter = new Hono<Env>().get('/sitemap.xml', rateLimitByIp('sitemap', 'resourceIp'), async (c) => {
  const xml = await through(c.var.requestContext.db, 'sitemap', {}, () => buildSitemapXml(c.var.requestContext.db))
  c.header('Content-Type', 'application/xml; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(xml)
})

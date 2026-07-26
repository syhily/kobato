import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { through } from '@/server/infra/cache/registry'
import { buildSitemapXml } from '@/server/render/seo/sitemap'

export const sitemapRouter = new Hono<Env>().get(
  '/sitemap.xml',
  rateLimitByIp('sitemap', 'resourceIp', { errorBody: { error: 'Too many requests' } }),
  async (c) => {
    const xml = await through(c.var.db, 'sitemap', {}, () => buildSitemapXml(c.var.db))
    c.header('Content-Type', 'application/xml; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(xml)
  },
)

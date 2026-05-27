import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { buildSitemapXml } from '@/server/render/seo/sitemap'
import { getClientAddress } from '@/shared/utils/request'

export const sitemapRouter = new Hono<Env>().get('/sitemap.xml', async (c) => {
  const { exceeded } = await tryResourceRateLimit(getClientAddress(c.req.raw))
  if (exceeded) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const xml = await buildSitemapXml(c.var.db, c.req.raw)
  c.header('Content-Type', 'application/xml; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(xml)
})

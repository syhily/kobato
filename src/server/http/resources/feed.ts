import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { feedResponse } from '@/server/render/feed/generator'
import { getSlug, scopeFromUrl } from '@/server/render/feed/scope'

async function writeFeedResponse(c: Context<Env>, kind: 'rss' | 'atom', scope?: Parameters<typeof feedResponse>[2]) {
  const res = await feedResponse(c.var.db, kind, scope)
  res.headers.forEach((v, k) => c.header(k, v))
  return c.body(await res.text())
}

export const feedRouter = new Hono<Env>()
  .get('/feed', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'rss', scopeFromUrl(c.req.url, undefined))
  })
  .get('/feed/atom', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'atom', scopeFromUrl(c.req.url, undefined))
  })
  .get('/cats/:slug/feed', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'rss', scopeFromUrl(c.req.url, getSlug({ slug: c.req.param('slug') })))
  })
  .get('/cats/:slug/feed/atom', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'atom', scopeFromUrl(c.req.url, getSlug({ slug: c.req.param('slug') })))
  })
  .get('/tags/:slug/feed', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'rss', scopeFromUrl(c.req.url, getSlug({ slug: c.req.param('slug') })))
  })
  .get('/tags/:slug/feed/atom', async (c) => {
    const { exceeded } = await tryResourceRateLimit(c.var.clientAddress)
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    return writeFeedResponse(c, 'atom', scopeFromUrl(c.req.url, getSlug({ slug: c.req.param('slug') })))
  })

import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'
import type { FeedOptions } from '@/server/render/feed/generator'

import { feedCacheFor } from '@/server/infra/cache/feed-cache'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { feedHeaders, generateFeeds } from '@/server/render/feed/generator'
import { getSlug, scopeFromUrl } from '@/server/render/feed/scope'

type FeedScope = Pick<FeedOptions, 'category' | 'tag'>

// Cache keys are namespaced because category and tag slugs share one slug namespace, and a category slugged `all` would otherwise collide with the site-wide feed.
function cacheKeyFor(scope?: FeedScope): string {
  if (scope?.category !== undefined) {
    return `cat:${scope.category}`
  }
  if (scope?.tag !== undefined) {
    return `tag:${scope.tag}`
  }
  return 'all'
}

async function writeFeedResponse(c: Context<Env>, kind: 'rss' | 'atom', scope?: FeedScope) {
  const cache = feedCacheFor(cacheKeyFor(scope))
  const feed =
    (await cache.get()) ??
    (await (async () => {
      const built = await generateFeeds(c.var.db, scope ?? {})
      await cache.set(built)
      return built
    })())
  new Headers(feedHeaders(kind)).forEach((value, name) => c.header(name, value))
  return c.body(kind === 'rss' ? feed.rss : feed.atom)
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

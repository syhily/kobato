import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'
import type { FeedOptions } from '@/server/render/feed/generator'

import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { through } from '@/server/infra/cache/registry'
import { generateFeeds } from '@/server/render/feed/generator'

const CONTENT_TYPES = {
  rss: 'application/xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
} as const

// Centralised cache headers for syndication feeds, applied to every feed
// response so all six feed URLs share one cache policy.
function feedHeaders(kind: 'rss' | 'atom'): HeadersInit {
  return {
    'Content-Type': CONTENT_TYPES[kind],
    'Cache-Control': 'public, max-age=1800',
  }
}

// Cache keys are namespaced because category and tag slugs share one slug namespace, and a category slugged `all` would otherwise collide with the site-wide feed.
function cacheKeyFor(scope?: FeedOptions): string {
  if (scope?.category !== undefined) {
    return `cat:${scope.category}`
  }
  if (scope?.tag !== undefined) {
    return `tag:${scope.tag}`
  }
  return 'all'
}

async function writeFeedResponse(c: Context<Env>, kind: 'rss' | 'atom', scope?: FeedOptions) {
  const feed = await through(c.var.db, 'feed', { scope: cacheKeyFor(scope) }, () =>
    generateFeeds(c.var.db, scope ?? {}),
  )
  new Headers(feedHeaders(kind)).forEach((value, name) => c.header(name, value))
  return c.body(kind === 'rss' ? feed.rss : feed.atom)
}

// Every handler knows its scope at compile time: the site-wide feeds pass no
// scope, the category/tag feeds pin their own taxonomy kind with the slug
// route param. The per-IP resource rate limit guards all of them with the
// public resource wire shape (`{ error: 'Too many requests' }`, 429).
export const feedRouter = new Hono<Env>()
  .use(rateLimitByIp('feed', 'resourceIp', { errorBody: { error: 'Too many requests' } }))
  .get('/feed', (c) => writeFeedResponse(c, 'rss'))
  .get('/feed/atom', (c) => writeFeedResponse(c, 'atom'))
  .get('/cats/:slug/feed', (c) => writeFeedResponse(c, 'rss', { category: c.req.param('slug') }))
  .get('/cats/:slug/feed/atom', (c) => writeFeedResponse(c, 'atom', { category: c.req.param('slug') }))
  .get('/tags/:slug/feed', (c) => writeFeedResponse(c, 'rss', { tag: c.req.param('slug') }))
  .get('/tags/:slug/feed/atom', (c) => writeFeedResponse(c, 'atom', { tag: c.req.param('slug') }))

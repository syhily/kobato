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

// One cache policy for all six feed URLs.
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
  const feed = await through(c.var.requestContext.db, 'feed', { scope: cacheKeyFor(scope) }, () =>
    generateFeeds(c.var.requestContext.db, scope ?? {}),
  )
  new Headers(feedHeaders(kind)).forEach((value, name) => c.header(name, value))
  return c.body(kind === 'rss' ? feed.rss : feed.atom)
}

// Scope is known at compile time per handler; the per-IP resource limiter
// guards all feeds. Passed per route, NEVER router-level `.use()` — mounted
// at `/`, a bare `.use()` would count every SSR page view against the bucket.
const feedRateLimit = rateLimitByIp('feed', 'resourceIp')

export const feedRouter = new Hono<Env>()
  .get('/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss'))
  .get('/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom'))
  .get('/cats/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { category: c.req.param('slug') }))
  .get('/cats/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { category: c.req.param('slug') }))
  .get('/tags/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { tag: c.req.param('slug') }))
  .get('/tags/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { tag: c.req.param('slug') }))

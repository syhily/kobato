import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { through } from '@/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@/server/infra/http/etag'
import { generateFeeds } from '@/server/render/feed/generator'
import { APP_VERSION } from '@/shared/config/version'

const CONTENT_TYPES = {
  rss: 'application/xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
} as const

/** Stored but revalidated before every reuse: a locale switch must never serve the old language. */
export const FEED_CACHE_CONTROL = 'public, no-cache'

interface FeedScope {
  category?: string
  tag?: string
}

// Cache keys are namespaced because category and tag slugs share one slug namespace, and a category slugged `all` would otherwise collide with the site-wide feed. The scope segment is composed with locale/version/settings-revision inside the registry declaration.
function cacheKeyFor(scope: FeedScope): string {
  if (scope.category !== undefined) {
    return `cat:${scope.category}`
  }
  if (scope.tag !== undefined) {
    return `tag:${scope.tag}`
  }
  return 'all'
}

async function writeFeedResponse(c: Context<Env>, kind: 'rss' | 'atom', scope: FeedScope = {}) {
  // ONE lazy capture pins the settings bundle, the locale and the settings
  // revision: the renderer's inputs and the cache key can never disagree.
  const { db, settings, localization } = c.var.requestContext
  const { locale, revisions } = localization
  const feed = await through(
    db,
    'feed',
    { scope: cacheKeyFor(scope), locale, version: APP_VERSION, settingsRevision: revisions.feed },
    () => generateFeeds(db, { ...scope, locale, settings }),
  )
  const body = kind === 'rss' ? feed.rss : feed.atom
  // ETag over the SERVED bytes: the cached body carries its own `updated`
  // timestamp, so hashing the buffer (not the inputs) stays stable on a hit.
  const etag = contentEtag(body)
  c.header('Content-Type', CONTENT_TYPES[kind])
  c.header('Cache-Control', FEED_CACHE_CONTROL)
  c.header('Content-Language', locale)
  c.header('ETag', etag)
  if (etagHeaderMatches(c.req.header('if-none-match'), etag)) {
    return c.body(null, 304)
  }
  return c.body(body)
}

// Scope is known at compile time per handler; the per-IP resource limiter
// guards all feeds. Passed per route, NEVER router-level `.use()` — mounted
// at `/`, a bare `.use()` would count every SSR page view against the bucket.
const feedRateLimit = rateLimitByIp('feed', 'resource')

export const feedRouter = new Hono<Env>()
  .get('/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss'))
  .get('/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom'))
  .get('/cats/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { category: c.req.param('slug') }))
  .get('/cats/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { category: c.req.param('slug') }))
  .get('/tags/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { tag: c.req.param('slug') }))
  .get('/tags/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { tag: c.req.param('slug') }))

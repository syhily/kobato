import type { Env } from '@kobato/server/http/hono-env.ts'
import type { Context } from 'hono'

import { APP_VERSION } from '@kobato/distribution/app.ts'
import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit.ts'
import { through } from '@kobato/server/infra/cache/registry.ts'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag.ts'
import { generateFeeds } from '@kobato/server/render/feed/generator.tsx'
import { Hono } from 'hono'

const CONTENT_TYPES = {
  rss: 'application/xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
} as const

export const FEED_CACHE_CONTROL = 'public, no-cache'

interface FeedScope {
  category?: string
  tag?: string
}

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
  const { db, settings, localization } = c.var.requestContext
  const { locale, revisions } = localization
  const feed = await through(
    'feed',
    { scope: cacheKeyFor(scope), locale, version: APP_VERSION, settingsRevision: revisions.feed },
    () => generateFeeds(db, { ...scope, locale, settings }),
  )
  const body = kind === 'rss' ? feed.rss : feed.atom
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

const feedRateLimit = rateLimitByIp('feed', 'resource')

export const feedRouter = new Hono<Env>()
  .get('/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss'))
  .get('/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom'))
  .get('/cats/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { category: c.req.param('slug') }))
  .get('/cats/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { category: c.req.param('slug') }))
  .get('/tags/:slug/feed', feedRateLimit, (c) => writeFeedResponse(c, 'rss', { tag: c.req.param('slug') }))
  .get('/tags/:slug/feed/atom', feedRateLimit, (c) => writeFeedResponse(c, 'atom', { tag: c.req.param('slug') }))

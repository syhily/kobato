import type { ResourceNotModified, ResourceOk } from '@kobato/api/contracts/primitives'
import type { FeedOutput } from '@kobato/api/contracts/public/feeds'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { feedsContract } from '@kobato/api/rpc/public/feeds'
import { APP_VERSION } from '@kobato/distribution/app'
import { resolveCategoryBySlugOrName } from '@kobato/server/domains/taxonomies/categories/services/query'
import { resolveTagBySlugOrName } from '@kobato/server/domains/taxonomies/tags/service'
import { contentNotFound } from '@kobato/server/http/content-not-found'
import { implementPublic, rateLimitByIp } from '@kobato/server/http/orpc-base'
import { through } from '@kobato/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { generateFeeds } from '@kobato/server/render/feed/generator'

const impl = implementPublic(feedsContract)

const CONTENT_TYPES = {
  rss: 'application/xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
} as const

const FEED_CACHE_CONTROL = 'public, no-cache'

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

function feedRepresentation(body: string, kind: keyof typeof CONTENT_TYPES, locale: string): ResourceOk {
  return {
    kind: 'ok',
    body,
    etag: contentEtag(body),
    contentType: CONTENT_TYPES[kind],
    cacheControl: FEED_CACHE_CONTROL,
    contentLanguage: locale,
  }
}

function notModified(answer: ResourceOk | ResourceNotModified): ResourceNotModified {
  return {
    kind: 'not-modified',
    etag: answer.etag,
    contentType: answer.contentType,
    cacheControl: answer.cacheControl,
    contentLanguage: answer.contentLanguage,
  }
}

async function feedAnswer(
  context: HandlerContext,
  kind: keyof typeof CONTENT_TYPES,
  scope: FeedScope,
  ifNoneMatch: string | undefined,
): Promise<FeedOutput> {
  const { db, settings, localization } = context
  const { locale, revisions } = localization
  if (scope.category !== undefined && (await resolveCategoryBySlugOrName(db, scope.category)) === null) {
    contentNotFound()
  }
  if (scope.tag !== undefined && (await resolveTagBySlugOrName(db, scope.tag)) === null) {
    contentNotFound()
  }
  const feed = await through(
    'feed',
    { scope: cacheKeyFor(scope), locale, version: APP_VERSION, settingsRevision: revisions.feed },
    () => generateFeeds(db, { ...scope, locale, settings }),
  )
  const answer = feedRepresentation(kind === 'rss' ? feed.rss : feed.atom, kind, locale)
  if (etagHeaderMatches(ifNoneMatch, answer.etag)) {
    return notModified(answer)
  }
  return answer
}

const feedRateLimit = rateLimitByIp('feed', 'resource')

const rss = impl.rss
  .use(feedRateLimit)
  .handler(async ({ input, context }) =>
    feedAnswer(context, 'rss', { category: input.category, tag: input.tag }, input.ifNoneMatch),
  )

const atom = impl.atom
  .use(feedRateLimit)
  .handler(async ({ input, context }) =>
    feedAnswer(context, 'atom', { category: input.category, tag: input.tag }, input.ifNoneMatch),
  )

export const feedsRouter = impl.router({ rss, atom })

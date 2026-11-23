import type { ContentNotModifiedSignal, ContentRedirectSignal } from '@kobato/api/contracts/content'
import type { Database } from '@kobato/db/sqlite/database'
import type { AppLocale } from '@kobato/i18n/locales'
import type { AuditContext } from '@kobato/server/domains/audit/types'
import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { contentListingsContract } from '@kobato/api/rpc/public/content'
import { toListingPostCard } from '@kobato/catalog/projection'
import { trackPageView } from '@kobato/server/domains/analytics/track'
import {
  countPublicPosts,
  getClientPostsWithMetadata,
  listClientPosts,
  listPublicPostCardsPaginated,
} from '@kobato/server/domains/posts/services/public-query'
import { findCategoryBySlug, listAllCategories } from '@kobato/server/domains/taxonomies/categories/services/query'
import { findTagBySlug } from '@kobato/server/domains/taxonomies/tags/service'
import { translateThrownResponse } from '@kobato/server/http/content-signals'
import { loadHomeData } from '@kobato/server/http/loaders/home'
import { listingLoader } from '@kobato/server/http/loaders/listing'
import { searchLoader } from '@kobato/server/http/loaders/search'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'
import {
  etagHeaderMatches,
  listingCalendarDay,
  listingEtag,
  listingRepresentation,
} from '@kobato/server/infra/http/etag'
import { ORPCError } from '@orpc/server'

const impl = implementPublic(contentListingsContract)

type ListingOutput<T> = ContentRedirectSignal | ContentNotModifiedSignal | { kind: 'ok'; etag: string; listing: T }
type PayloadOutput<T> = ContentNotModifiedSignal | { kind: 'ok'; etag: string; payload: T }

function listingEtagFor(context: HandlerContext, payload: unknown): string {
  const localization = context.localization
  return listingEtag({
    representation: listingRepresentation(localization),
    payload,
    calendarDay: listingCalendarDay(payload, localization),
  })
}

function trackListingPageView(context: HandlerContext): void {
  trackPageView(context.requestFacts, null, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })
}

async function runListing<T>(
  context: HandlerContext,
  ifNoneMatch: string | undefined,
  load: () => Promise<T>,
): Promise<ListingOutput<T>> {
  let listing: T
  try {
    listing = await load()
  } catch (error) {
    return translateThrownResponse(error, 'redirect-only')
  }

  const etag = listingEtagFor(context, listing)
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    return { kind: 'not-modified' as const, etag }
  }

  trackListingPageView(context)
  return { kind: 'ok' as const, etag, listing }
}

async function runListingPayload<T>(
  context: HandlerContext,
  ifNoneMatch: string | undefined,
  load: () => Promise<T>,
): Promise<PayloadOutput<T>> {
  const payload = await load()
  const etag = listingEtagFor(context, payload)
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    return { kind: 'not-modified' as const, etag }
  }

  trackListingPageView(context)
  return { kind: 'ok' as const, etag, payload }
}

async function scopedPostsListing({
  db,
  num,
  filters,
  rootPath,
  title,
  description,
  locale,
  settings,
  ogImageUrl,
}: {
  db: Database
  num: string | undefined
  filters: { includeHidden: boolean; includeScheduled: boolean; tag?: string; categoryId?: number }
  rootPath: string
  title: string
  description?: string
  locale: AppLocale
  settings: BlogSettingsBundle | null
  ogImageUrl?: string
}) {
  return listingLoader(db, {
    rawNum: num,
    totalPosts: await countPublicPosts(db, filters),
    fetchPage: ({ pageNum, limit, offset }) => listPublicPostCardsPaginated(db, pageNum, limit, { ...filters, offset }),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title,
    description,
    locale,
    settings,
    ogImageUrl,
    extra: undefined,
  })
}

const home = impl.home.handler(async ({ input, context }) => {
  return runListing(context, input.ifNoneMatch, () =>
    loadHomeData({
      db: context.db,
      session: context.session,
      num: input.num,
      locale: context.localization.locale,
      settings: context.settings,
      revision: context.localization.revisions.listing,
    }),
  )
})

const postsList = impl.postsList.handler(async ({ input, context }) => {
  const db = context.db

  if (input.scope.type === 'tag') {
    const tag = await findTagBySlug(db, input.scope.slug)
    if (!tag) {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    }

    return runListing(context, input.ifNoneMatch, () =>
      scopedPostsListing({
        db,
        num: input.num,
        filters: { includeHidden: true, includeScheduled: false, tag: tag.name },
        rootPath: `/tags/${tag.slug}`,
        title: tag.name,
        locale: context.localization.locale,
        settings: context.settings,
        ogImageUrl: tag.ogImage || undefined,
      }),
    )
  }

  const category = await findCategoryBySlug(db, input.scope.slug)
  if (!category) {
    throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
  }

  return runListing(context, input.ifNoneMatch, () =>
    scopedPostsListing({
      db,
      num: input.num,
      filters: { includeHidden: true, includeScheduled: false, categoryId: category.id },
      rootPath: `/cats/${category.slug}`,
      title: category.name,
      description: category.description,
      locale: context.localization.locale,
      settings: context.settings,
      ogImageUrl: category.og ?? `/images/og/cats/${category.slug}.png`,
    }),
  )
})

const search = impl.use(resourceRateLimit).search.handler(async ({ input, context }) => {
  const auditContext: AuditContext = {
    viewer: context.viewer,
    clientAddress: context.clientAddress,
    requestFacts: context.requestFacts,
  }
  return runListing(context, input.ifNoneMatch, () =>
    searchLoader(context.db, {
      keyword: input.keyword,
      num: input.num,
      locale: context.localization.locale,
      settings: context.settings,
      auditContext,
    }),
  )
})

const categoriesList = impl.categoriesList.handler(async ({ input, context }) => {
  return runListingPayload(context, input.ifNoneMatch, async () => ({
    categories: await listAllCategories(context.db),
  }))
})

const archives = impl.archives.use(resourceRateLimit).handler(async ({ input, context }) => {
  return runListingPayload(context, input.ifNoneMatch, async () => {
    const db = context.db
    const listingNowIso = new Date().toISOString()
    const rawPosts = await listClientPosts(db, { includeHidden: true, includeScheduled: false, limit: 10_000 })
    const posts = rawPosts.map(toListingPostCard)
    const resolvedPosts = await getClientPostsWithMetadata(db, posts, {
      likes: true,
      views: true,
      comments: false,
    })
    return { resolvedPosts, listingNowIso }
  })
})

export const contentListingsRouter = impl.router({
  home,
  postsList,
  search,
  categoriesList,
  archives,
})

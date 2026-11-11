import { ORPCError } from '@orpc/server'

import type { AuditContext } from '@/server/domains/audit/types'
import type { HandlerContext } from '@/server/http/orpc-base'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { ContentNotModifiedSignal, ContentRedirectSignal } from '@/shared/contracts/content'
import type { AppLocale } from '@/shared/i18n/locales'

import { trackPageView } from '@/server/domains/analytics/track'
import {
  countPublicPosts,
  getClientPostsWithMetadata,
  listClientPosts,
  listPublicPostCardsPaginated,
} from '@/server/domains/posts/services/public-query'
import { findCategoryBySlug, listAllCategories } from '@/server/domains/taxonomies/categories/services/query'
import { findTagBySlug } from '@/server/domains/taxonomies/tags/service'
import { translateThrownResponse } from '@/server/http/content-signals'
import { loadHomeData } from '@/server/http/loaders/home'
import { listingLoader } from '@/server/http/loaders/listing'
import { searchLoader } from '@/server/http/loaders/search'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { etagHeaderMatches, listingCalendarDay, listingEtag, listingRepresentation } from '@/server/infra/http/etag'
import {
  contentArchivesInputSchema,
  contentArchivesOutputSchema,
  contentCategoriesListInputSchema,
  contentCategoriesListOutputSchema,
  contentHomeInputSchema,
  contentHomeOutputSchema,
  contentPostsListInputSchema,
  contentPostsListOutputSchema,
  contentSearchInputSchema,
  contentSearchOutputSchema,
} from '@/shared/contracts/content'
import { toListingPostCard } from '@/shared/types/catalog'

type ListingOutput<T> = ContentRedirectSignal | ContentNotModifiedSignal | { kind: 'ok'; etag: string; listing: T }
type PayloadOutput<T> = ContentNotModifiedSignal | { kind: 'ok'; etag: string; payload: T }

/**
 * Fingerprint the fully assembled listing payload. The listing representation
 * revision + APP_VERSION + the site calendar day (relative-date bucket) ride
 * alongside the payload, so a matching `If-None-Match` proves the document is
 * byte-identical before any 304 is emitted. The calendar day comes from the
 * payload's own `listingNowIso` so the tag and the rendered relative dates can
 * never disagree across a site-zone midnight.
 */
function listingEtagFor(context: HandlerContext, payload: unknown): string {
  const localization = context.localization
  return listingEtag({
    representation: listingRepresentation(localization),
    payload,
    calendarDay: listingCalendarDay(payload, localization),
  })
}

/** A rendered listing counts one view; a redirect or a 304 never does. */
function trackListingPageView(context: HandlerContext): void {
  trackPageView(context.requestFacts, null, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })
}

// Every listing procedure answers pagination redirects through the same
// thrown-`Response` → union translation — wrap the revalidation once.
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

// Archives/categories ship a flat payload rather than a paginated listing —
// same revalidation contract, different payload slot.
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

// The tag/category scoped listings differ only in their taxonomy lookup and
// the filter/rootPath/SEO fields derived from it — one shared pipeline.
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
  /** Request UI locale — pagination copy is system text. */
  locale: AppLocale
  /** Request-pinned settings bundle — page size comes from THIS capture. */
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

// The home listing — the whole pipeline lives in `loadHomeData`; this
// only wraps the thrown-Response → union translation.
const home = publicProc
  .route({ method: 'GET', path: '/content/home' })
  .input(contentHomeInputSchema)
  .output(contentHomeOutputSchema)
  .handler(async ({ input, context }) => {
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

// Scoped listings (`/tags/:slug`, `/cats/:slug`); unknown slug → NOT_FOUND.
const postsList = publicProc
  .route({ method: 'GET', path: '/content/posts/list' })
  .input(contentPostsListInputSchema)
  .output(contentPostsListOutputSchema)
  .handler(async ({ input, context }) => {
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

// Keyword search — the empty-keyword 302, overflow redirects, and the audit event stay inside `searchLoader`.
// Every miss is a full-corpus LIKE scan and every distinct keyword with hits
// writes a slug list to the cache + an audit row, so the procedure is throttled.
const search = publicProc
  .route({ method: 'GET', path: '/content/search' })
  // Limiter before `.input(...)`: oRPC validates input at its declared
  // index, so a trailing middleware never sees a malformed payload.
  .use(resourceRateLimit)
  .input(contentSearchInputSchema)
  .output(contentSearchOutputSchema)
  .handler(async ({ input, context }) => {
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

const categoriesList = publicProc
  .route({ method: 'GET', path: '/content/categories/list' })
  .input(contentCategoriesListInputSchema)
  .output(contentCategoriesListOutputSchema)
  .handler(async ({ input, context }) => {
    return runListingPayload(context, input.ifNoneMatch, async () => ({
      categories: await listAllCategories(context.db),
    }))
  })

// The archives payload (up to 10k posts + 4 metadata statements) is a
// deliberate full-corpus fan-out — throttle it like the other expensive reads.
const archives = publicProc
  .route({ method: 'GET', path: '/content/archives' })
  .input(contentArchivesInputSchema)
  .output(contentArchivesOutputSchema)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    return runListingPayload(context, input.ifNoneMatch, async () => {
      const db = context.db
      const listingNowIso = new Date().toISOString()
      // Archives promise completeness — explicit 10k bound (helper defaults to 200);
      // revisit with year-grouped pagination past ~2,000 live posts.
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

export const contentListingsRouter = {
  home,
  postsList,
  search,
  categoriesList,
  archives,
}

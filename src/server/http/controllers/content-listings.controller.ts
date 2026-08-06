import { ORPCError } from '@orpc/server'

import type { AuditContext } from '@/server/domains/audit/types'
import type { Database } from '@/server/infra/db/database'
import type { ContentRedirectSignal } from '@/shared/contracts/content'

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
import { publicProc } from '@/server/http/orpc-base'
import {
  contentArchivesOutputSchema,
  contentCategoriesListOutputSchema,
  contentHomeInputSchema,
  contentHomeOutputSchema,
  contentPostsListInputSchema,
  contentPostsListOutputSchema,
  contentSearchInputSchema,
  contentSearchOutputSchema,
} from '@/shared/contracts/content'
import { toListingPostCard } from '@/shared/types/catalog'

// Every listing procedure answers pagination redirects through the same
// thrown-`Response` → union translation — wrap the try/translate once.
async function runListing<T>(load: () => Promise<T>): Promise<ContentRedirectSignal | { kind: 'ok'; listing: T }> {
  try {
    return { kind: 'ok' as const, listing: await load() }
  } catch (error) {
    return translateThrownResponse(error, 'redirect-only')
  }
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
  ogImageUrl,
}: {
  db: Database
  num: string | undefined
  filters: { includeHidden: boolean; includeScheduled: boolean; tag?: string; categoryId?: number }
  rootPath: string
  title: string
  description?: string
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
    ogImageUrl,
    extra: undefined,
  })
}

// The home listing (`/` + `/page/:num`). The whole pipeline — analytics
// write, settings gates, feature fan-out — lives in
// `loaders/home.ts::loadHomeData`; this procedure only wraps it in the
// thrown-Response → union translation.
const home = publicProc
  .route({ method: 'GET', path: '/content/home' })
  .input(contentHomeInputSchema)
  .output(contentHomeOutputSchema)
  .handler(async ({ input, context }) => {
    return runListing(() =>
      loadHomeData({
        db: context.db,
        session: context.session,
        viewer: context.viewer,
        requestFacts: context.requestFacts,
        clientAddress: context.clientAddress,
        num: input.num,
      }),
    )
  })

// Scoped listings (`/tags/:slug`, `/cats/:slug`). An unknown taxonomy
// slug is a NOT_FOUND; pagination redirects ride the union.
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

      return runListing(() =>
        scopedPostsListing({
          db,
          num: input.num,
          filters: { includeHidden: true, includeScheduled: false, tag: tag.name },
          rootPath: `/tags/${tag.slug}`,
          title: tag.name,
          ogImageUrl: tag.ogImage || undefined,
        }),
      )
    }

    const category = await findCategoryBySlug(db, input.scope.slug)
    if (!category) {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    }

    return runListing(() =>
      scopedPostsListing({
        db,
        num: input.num,
        filters: { includeHidden: true, includeScheduled: false, categoryId: category.id },
        rootPath: `/cats/${category.slug}`,
        title: category.name,
        description: category.description,
        ogImageUrl: category.og ?? `/images/og/cats/${category.slug}.png`,
      }),
    )
  })

// Keyword search (`/search/:keyword`). The empty-keyword 302, the
// overflow redirects, and the `search` audit event all stay exactly
// where they were — inside `searchLoader`.
const search = publicProc
  .route({ method: 'GET', path: '/content/search' })
  .input(contentSearchInputSchema)
  .output(contentSearchOutputSchema)
  .handler(async ({ input, context }) => {
    const auditContext: AuditContext = {
      viewer: context.viewer,
      clientAddress: context.clientAddress,
      requestFacts: context.requestFacts,
    }
    return runListing(() => searchLoader(context.db, { keyword: input.keyword, num: input.num, auditContext }))
  })

const categoriesList = publicProc
  .route({ method: 'GET', path: '/content/categories/list' })
  .output(contentCategoriesListOutputSchema)
  .handler(async ({ context }) => {
    return { categories: await listAllCategories(context.db) }
  })

const archives = publicProc
  .route({ method: 'GET', path: '/content/archives' })
  .output(contentArchivesOutputSchema)
  .handler(async ({ context }) => {
    const db = context.db
    const listingNowIso = new Date().toISOString()
    // Archives promises completeness: list every live post. The bound is explicit
    // (the helper otherwise defaults to 200) and far above any realistic personal
    // blog; if it ever bites, the fix is year-grouped pagination, not a lower cap.
    // Audit P1-22 reviewed this and deferred that work behind a scale trigger:
    // revisit when a deployment passes ~2,000 live posts (~6-7 batched queries,
    // ~1-3MB payload at the 10k cap — no per-post fan-out).
    const rawPosts = await listClientPosts(db, { includeHidden: true, includeScheduled: false, limit: 10_000 })
    const posts = rawPosts.map(toListingPostCard)
    const resolvedPosts = await getClientPostsWithMetadata(db, posts, {
      likes: true,
      views: true,
      comments: false,
    })
    return { resolvedPosts, listingNowIso }
  })

export const contentListingsRouter = {
  home,
  postsList,
  search,
  categoriesList,
  archives,
}

import type { RequestContext } from '@kobato/server/http/request-context'
import type { Database } from '@kobato/server/infra/db/database'
import type { HomeExtra, ListingPageLoaderData, ListingPostCardWithMetadata } from '@kobato/shared/types/catalog'

import { trackPageView } from '@kobato/server/domains/analytics/track'
import { selectFeaturePosts, selectSidebarPosts } from '@kobato/server/domains/posts/services/featured'
import {
  countPublicPosts,
  getClientPostsWithMetadata,
  listClientPosts,
  listPublicPostCardsPaginated,
} from '@kobato/server/domains/posts/services/public-query'
import { findCategoryBySlug, getCategoryLinks } from '@kobato/server/domains/taxonomies/categories/services/query'
import { findTagBySlug, listAllTags } from '@kobato/server/domains/taxonomies/tags/service'
import { listingLoader } from '@kobato/server/http/loaders/listing'
import { loadSidebarData } from '@kobato/server/http/loaders/sidebar'
import { selectSidebarTags } from '@kobato/server/http/loaders/sidebar-select'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { getSidebarWidgetCount, isSidebarWidgetEnabled } from '@kobato/shared/config/utils'
import { toListingPostCard } from '@kobato/shared/types/catalog'
import { formatLocalDate } from '@kobato/shared/utils/formatter'

/**
 * Listing-page assembly shared between the route loaders and the
 * headless Content API procedures — same shape, same queries.
 * `null` answers "entity not found" (route throws 404, procedure
 * answers NOT_FOUND).
 */

export async function loadHomeData(
  db: Database,
  rc: RequestContext,
  rawNum: string | undefined,
): Promise<ListingPageLoaderData<HomeExtra>> {
  // Time-series access-log write for the analytics dashboard (homepage:
  // null target — counter skipped, row still counts toward visits).
  void trackPageView(rc.requestFacts, null, {
    isAdmin: rc.viewer?.role === 'admin',
    clientAddress: rc.clientAddress,
  })

  const content = requireBlogSettingsSection('content')
  const homePageSize = content.pagination.posts
  const mergeTailWhenLessThan = Math.max(0, homePageSize - 2)

  const filters = {
    includeHidden: false,
    includeScheduled: import.meta.env.DEV,
  }

  const sidebarSettings = requireBlogSettingsSection('sidebar')
  const recentPostsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'recentPosts')
  const randomTagsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'randomTags')

  const [totalPosts, sidebar, featureSeed] = await Promise.all([
    countPublicPosts(db, filters),
    loadSidebarData(db, rc.session),
    Promise.resolve(formatLocalDate(new Date(), 'yyyy-MM-dd', requireBlogSettingsSection('siteIdentity'))),
  ])

  const featurePromise = selectFeaturePosts(db, featureSeed)
  const sidebarPostsPromise = recentPostsEnabled
    ? selectSidebarPosts(db, getSidebarWidgetCount(sidebarSettings, 'recentPosts'))
    : Promise.resolve([])
  const tagsPromise = randomTagsEnabled ? listAllTags(db) : Promise.resolve([])

  return listingLoader<HomeExtra>(db, {
    rawNum,
    totalPosts,
    fetchPage: ({ pageNum, limit, offset }) =>
      listPublicPostCardsPaginated(db, pageNum, limit, {
        ...filters,
        offset,
      }),
    rootPath: '/',
    pageSize: homePageSize,
    mergeTailWhenLessThan,
    metadata: { likes: true, views: true, comments: true },
    seoMode: 'skip-on-first-page',
    allowEmpty: true,
    computeExtra: async ({ resolvedPosts }) => {
      const uniqueCategories = [...new Set(resolvedPosts.map((p) => p.category).filter(Boolean))]
      const [categoryLinks, featurePosts, tags] = await Promise.all([
        getCategoryLinks(db, uniqueCategories),
        featurePromise,
        tagsPromise,
      ])

      return {
        categoryLinks,
        featurePosts: featurePosts.map((post) => ({
          id: post.id,
          slug: post.slug,
          title: post.title,
          summary: post.summary,
          cover: post.cover,
          coverThumbhash: post.coverThumbhash,
          permalink: post.permalink,
          category: post.category,
          date: post.date,
          published: post.published,
        })),
        sidebar: {
          posts: await sidebarPostsPromise,
          tags: selectSidebarTags(tags),
          recentComments: sidebar.recentComments,
        },
      }
    },
  })
}

/**
 * Plain paginated post listing — the home listing minus the
 * featured/sidebar extras. Same pagination semantics as home (page
 * size, tail-merge, canonical collapse, overflow redirect) and the
 * same post set (`includeHidden: false`; DEV shows scheduled posts),
 * so a third-party frontend paginating this endpoint sees exactly the
 * `pageNum`/`totalPage`/`resolvedPosts` of `/content/v1/home` — just
 * without the `extra` payload. There is no SSR route for it; the
 * headless Content API procedure (`public.postList`) is the only
 * consumer.
 */
export async function loadPostListData(db: Database, rawNum: string | undefined): Promise<ListingPageLoaderData> {
  const content = requireBlogSettingsSection('content')
  const pageSize = content.pagination.posts
  const mergeTailWhenLessThan = Math.max(0, pageSize - 2)

  const filters = {
    includeHidden: false,
    includeScheduled: import.meta.env.DEV,
  }

  return listingLoader(db, {
    rawNum,
    totalPosts: await countPublicPosts(db, filters),
    fetchPage: ({ pageNum, limit, offset }) => listPublicPostCardsPaginated(db, pageNum, limit, { ...filters, offset }),
    rootPath: '/',
    pageSize,
    mergeTailWhenLessThan,
    metadata: { likes: true, views: true, comments: true },
    seoMode: 'skip-on-first-page',
    allowEmpty: true,
    extra: undefined,
  })
}

export async function loadCategoryListData(
  db: Database,
  slug: string,
  rawNum: string | undefined,
): Promise<ListingPageLoaderData | null> {
  const category = await findCategoryBySlug(db, slug)
  if (!category) {
    return null
  }

  const rootPath = `/cats/${category.slug}`
  const filters = {
    includeHidden: true,
    includeScheduled: false,
    categoryId: category.id,
  }

  return listingLoader(db, {
    rawNum,
    totalPosts: await countPublicPosts(db, filters),
    fetchPage: ({ pageNum, limit, offset }) => listPublicPostCardsPaginated(db, pageNum, limit, { ...filters, offset }),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: category.name,
    description: category.description,
    ogImageUrl: category.og ?? `/images/og/cats/${category.slug}.png`,
    extra: undefined,
  })
}

export async function loadTagListData(
  db: Database,
  slug: string,
  rawNum: string | undefined,
): Promise<ListingPageLoaderData | null> {
  const tag = await findTagBySlug(db, slug)
  if (!tag) {
    return null
  }

  const rootPath = `/tags/${tag.slug}`
  const filters = {
    includeHidden: true,
    includeScheduled: false,
    tag: tag.name,
  }

  return listingLoader(db, {
    rawNum,
    totalPosts: await countPublicPosts(db, filters),
    fetchPage: ({ pageNum, limit, offset }) => listPublicPostCardsPaginated(db, pageNum, limit, { ...filters, offset }),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: tag.name,
    extra: undefined,
    ogImageUrl: tag.ogImage || undefined,
  })
}

export interface ArchivesData {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
}

export async function loadArchivesData(db: Database): Promise<ArchivesData> {
  const listingNowIso = new Date().toISOString()
  // Archives promises completeness: list every live post. The bound is
  // explicit (the helper otherwise defaults to 200) and far above any
  // realistic personal blog — see the route's comment for the scale
  // trigger.
  const rawPosts = await listClientPosts(db, { includeHidden: true, includeScheduled: false, limit: 10_000 })
  const posts = rawPosts.map(toListingPostCard)
  const resolvedPosts = await getClientPostsWithMetadata(db, posts, {
    likes: true,
    views: true,
    comments: false,
  })
  return { resolvedPosts, listingNowIso }
}

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { RequestFacts } from '@/server/infra/http/request-facts'
import type { HomeExtra } from '@/shared/contracts/content'
import type { ClientPost, ListingPostCard } from '@/shared/types/catalog'
import type { ListingPageLoaderData } from '@/shared/types/listing'

import { trackPageView } from '@/server/domains/analytics/track'
import { selectFeaturePosts, selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/services/public-query'
import { getCategoryLinks } from '@/server/domains/taxonomies/categories/services/query'
import { listAllTags } from '@/server/domains/taxonomies/tags/service'
import { listingLoader } from '@/server/http/loaders/listing'
import { loadSidebarData } from '@/server/http/loaders/sidebar'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount, isSidebarWidgetEnabled } from '@/shared/config/utils'
import { formatLocalDate } from '@/shared/utils/formatter'

// Tail-merge guard: an orphan last page (< pageSize − 2 posts) merges into
// its predecessor (clamped at 0 for tiny page sizes). See `listingLoader`.
function homeMergeTailWhenLessThan(homePageSize: number): number {
  return Math.max(0, homePageSize - 2)
}

// Feature posts ride the home payload as plain listing cards — project to exactly the card fields.
function toFeaturePostCards(posts: ClientPost[]): ListingPostCard[] {
  return posts.map((post) => ({
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
  }))
}

// The home listing pipeline (`/` + `/page/:num`) behind `content.home`:
// analytics access-log write (null target) + all settings reads.
export async function loadHomeData({
  db,
  session,
  viewer,
  requestFacts,
  clientAddress,
  num,
}: {
  db: Database
  session: BlogSession
  viewer: SessionUser | null
  requestFacts: RequestFacts
  clientAddress: string
  num: string | undefined
}): Promise<ListingPageLoaderData<HomeExtra>> {
  // Time-series access-log write; the view gate lives inside `trackPageView`.
  void trackPageView(requestFacts, null, {
    isAdmin: viewer?.role === 'admin',
    clientAddress,
  })

  const homePageSize = requireBlogSettingsSection('content').pagination.posts

  const filters = {
    includeHidden: false,
    includeScheduled: import.meta.env.DEV,
  }

  const sidebarSettings = requireBlogSettingsSection('sidebar')
  const recentPostsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'recentPosts')
  const randomTagsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'randomTags')

  const [totalPosts, sidebar, featureSeed] = await Promise.all([
    countPublicPosts(db, filters),
    loadSidebarData(db, session),
    Promise.resolve(formatLocalDate(new Date(), 'yyyy-MM-dd', requireBlogSettingsSection('siteIdentity'))),
  ])

  // Kick off independent queries in parallel with the listing pipeline.
  const featurePromise = selectFeaturePosts(db, featureSeed)
  const sidebarPostsPromise = recentPostsEnabled
    ? selectSidebarPosts(db, getSidebarWidgetCount(sidebarSettings, 'recentPosts'))
    : Promise.resolve([])
  const tagsPromise = randomTagsEnabled ? listAllTags(db) : Promise.resolve([])

  return listingLoader<HomeExtra>(db, {
    rawNum: num,
    totalPosts,
    fetchPage: ({ pageNum, limit, offset }) =>
      listPublicPostCardsPaginated(db, pageNum, limit, {
        ...filters,
        offset,
      }),
    rootPath: '/',
    pageSize: homePageSize,
    mergeTailWhenLessThan: homeMergeTailWhenLessThan(homePageSize),
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
        featurePosts: toFeaturePostCards(featurePosts),
        sidebar: {
          posts: await sidebarPostsPromise,
          tags: selectSidebarTags(tags),
          recentComments: sidebar.recentComments,
        },
      }
    },
  })
}

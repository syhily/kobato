import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { HomeExtra } from '@/shared/contracts/content'
import type { AppLocale } from '@/shared/i18n/locales'
import type { ClientPost, ListingPostCard } from '@/shared/types/catalog'
import type { ListingPageLoaderData } from '@/shared/types/listing'

import { selectFeaturePosts, selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/services/public-query'
import { getCategoryLinks } from '@/server/domains/taxonomies/categories/services/query'
import { listAllTags } from '@/server/domains/taxonomies/tags/service'
import { listingLoader } from '@/server/http/loaders/listing'
import { loadSidebarData } from '@/server/http/loaders/sidebar'
import { selectSidebarTags, sidebarSelectionSeed } from '@/server/http/loaders/sidebar-select'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { isSidebarWidgetEnabled } from '@/shared/config/utils'
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
// all settings reads + the random sidebar selection. The page view is recorded
// by the controller AFTER listing revalidation (a 304 never counts).
export async function loadHomeData({
  db,
  session,
  num,
  locale,
  settings,
  revision,
}: {
  db: Database
  session: BlogSession
  num: string | undefined
  /** Request UI locale — drives pagination copy in the listing SEO. */
  locale: AppLocale
  /** Request-pinned settings snapshot (same capture as `locale`). */
  settings: BlogSettingsBundle | null
  /** Listing-scope generation — the sidebar rotation bucket's generation. */
  revision: string
}): Promise<ListingPageLoaderData<HomeExtra>> {
  const homePageSize = requireBlogSettingsSection('content', settings).pagination.posts

  const filters = {
    includeHidden: false,
    includeScheduled: import.meta.env.DEV,
  }

  const sidebarSettings = requireBlogSettingsSection('sidebar', settings)
  const recentPostsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'recentPosts')
  const randomTagsEnabled = isSidebarWidgetEnabled(sidebarSettings, 'randomTags')

  const [totalPosts, sidebar, calendarDay] = await Promise.all([
    countPublicPosts(db, filters),
    loadSidebarData(db, session, settings),
    Promise.resolve(formatLocalDate(new Date(), 'yyyy-MM-dd', requireBlogSettingsSection('siteIdentity', settings))),
  ])

  // One seeded selection for both widgets: the random widgets rotate per site
  // calendar day, not per render (a per-request draw churns the payload).
  const sidebarSelection = {
    settings: sidebarSettings,
    seed: sidebarSelectionSeed({ scope: 'home', date: calendarDay, revision }),
  }

  // Kick off independent queries in parallel with the listing pipeline.
  const featurePromise = selectFeaturePosts(db, calendarDay)
  const sidebarPostsPromise = recentPostsEnabled ? selectSidebarPosts(db, sidebarSelection) : Promise.resolve([])
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
    locale,
    settings,
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
          tags: selectSidebarTags(tags, sidebarSelection),
          recentComments: sidebar.recentComments,
        },
      }
    },
  })
}

import type { ListingPageLoaderData } from '@kobato/catalog/listing'
import type { ClientPost, ListingPostCard } from '@kobato/catalog/model'
import type { HomeExtra } from '@kobato/contracts/content'
import type { Database } from '@kobato/db/database'
import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { selectFeaturePosts, selectSidebarPosts } from '@kobato/server/domains/posts/services/featured'
import { countPublicPosts, listPublicPostCardsPaginated } from '@kobato/server/domains/posts/services/public-query'
import { getCategoryLinks } from '@kobato/server/domains/taxonomies/categories/services/query'
import { listAllTags } from '@kobato/server/domains/taxonomies/tags/service'
import { listingLoader } from '@kobato/server/http/loaders/listing'
import { loadSidebarData } from '@kobato/server/http/loaders/sidebar'
import { selectSidebarTags, sidebarSelectionSeed } from '@kobato/server/http/loaders/sidebar-select'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { isSidebarWidgetEnabled } from '@kobato/settings/presentation'
import { formatLocalDate } from '@kobato/utils/site-date'

function homeMergeTailWhenLessThan(homePageSize: number): number {
  return Math.max(0, homePageSize - 2)
}

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
  locale: AppLocale
  settings: BlogSettingsBundle | null
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

  const sidebarSelection = {
    settings: sidebarSettings,
    seed: sidebarSelectionSeed({ scope: 'home', date: calendarDay, revision }),
  }

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

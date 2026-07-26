import type { ListingPageLoaderData } from '@/server/http/loaders/listing'
import type { ListingPostCard } from '@/shared/types/catalog'
import type { SidebarData } from '@/ui/public/Sidebar'

import { trackAccess } from '@/server/domains/analytics/track'
import { selectFeaturePosts, selectSidebarPosts } from '@/server/domains/posts/services/featured'
import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/services/public-query'
import { getCategoryLinks } from '@/server/domains/taxonomies/categories/services/query'
import { listAllTags } from '@/server/domains/taxonomies/tags/service'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders } from '@/server/http/loaders/route-exports'
import { loadSidebarData } from '@/server/http/loaders/sidebar'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { getRequestContext } from '@/server/http/request-context'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount, isSidebarWidgetEnabled } from '@/shared/config/utils'
import { metaWithFallback } from '@/shared/seo/meta'
import { formatLocalDate } from '@/shared/utils/formatter'
import { HomeLayoutBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/home'

interface HomeExtra {
  categoryLinks: Record<string, string>
  featurePosts: ListingPostCard[]
  sidebar: SidebarData
}

export async function loader({
  request,
  context,
  params,
}: Route.LoaderArgs): Promise<ListingPageLoaderData<HomeExtra>> {
  const rc = getRequestContext({ request, context })
  const db = rc.db

  // Time-series access-log write for the analytics dashboard. The
  // homepage isn't a content detail page so we pass a null target —
  // the row still counts toward visits / visitors / referers. The
  // admin-exemption (so the dashboard owner doesn't pollute their
  // own visitor metrics) lives inside `trackAccess`; pass `isAdmin`
  // so it can apply the exemption and honour the analytics settings.
  void trackAccess(rc.requestFacts, null, {
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

  // Kick off independent queries in parallel with the listing pipeline.
  const featurePromise = selectFeaturePosts(db, featureSeed)
  const sidebarPostsPromise = recentPostsEnabled
    ? selectSidebarPosts(db, getSidebarWidgetCount(sidebarSettings, 'recentPosts'))
    : Promise.resolve([])
  const tagsPromise = randomTagsEnabled ? listAllTags(db) : Promise.resolve([])

  return listingLoader<HomeExtra>(db, {
    rawNum: params.num,
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

export const headers = listingHeaders

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function HomeRoute({ loaderData, matches }: Route.ComponentProps) {
  const { pageNum, totalPage, resolvedPosts, extra } = loaderData
  const rootData = matches[0]?.loaderData as { currentUser?: { role: string } | null } | undefined
  return (
    <HomeLayoutBody
      resolvedPosts={resolvedPosts}
      pageNum={pageNum}
      totalPage={totalPage}
      categoryLinks={extra.categoryLinks}
      featurePosts={extra.featurePosts}
      sidebar={extra.sidebar}
      listingNowIso={loaderData.listingNowIso}
      currentUser={rootData?.currentUser ?? null}
    />
  )
}

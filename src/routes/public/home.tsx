import { useRouteLoaderData } from 'react-router'

import type { ListingPageLoaderData } from '@/server/http/loaders/listing'
import type { ListingPostCard } from '@/shared/types/catalog'
import type { SidebarData } from '@/ui/public/Sidebar'

import { trackAccess } from '@/server/domains/analytics/track'
import { getRouteRequestContext } from '@/server/domains/auth/context'
import { userSession } from '@/server/domains/auth/primitives'
import {
  countPublicPosts,
  listPublicPostCardsPaginated,
  selectFeaturePosts,
  selectSidebarPosts,
} from '@/server/domains/posts/repo'
import { getCategoryLinks } from '@/server/domains/taxonomies/categories/service'
import { listAllTags } from '@/server/domains/taxonomies/tags/service'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { loadSidebarData } from '@/server/http/loaders/sidebar'
import { selectSidebarTags } from '@/server/http/loaders/sidebar-select'
import { metaWithFallback } from '@/server/render/seo/meta'
import { getSidebarWidgetCount, requireBlogSettingsSection } from '@/shared/config/blog'
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
  const { session } = getRouteRequestContext({ request, context })

  // Time-series access-log write for the analytics dashboard. The
  // homepage isn't a content detail page so we pass a null target —
  // the row still counts toward visits / visitors / referers. The
  // admin-exemption (so the dashboard owner doesn't pollute their
  // own visitor metrics) lives inside `trackAccess`; pass `isAdmin`
  // so it can apply the exemption and honour `ANALYTICS_TRACK_ADMIN`.
  void trackAccess(request, null, { isAdmin: userSession(session)?.role === 'admin' })

  const content = requireBlogSettingsSection('content')
  const homePageSize = content.pagination.posts
  const mergeTailWhenLessThan = Math.max(0, homePageSize - 2)

  const filters = {
    includeHidden: false,
    includeScheduled: import.meta.env.DEV,
  }

  const [totalPosts, sidebar, featureSeed] = await Promise.all([
    countPublicPosts(filters),
    loadSidebarData(session),
    Promise.resolve(formatLocalDate(new Date(), 'yyyy-MM-dd', requireBlogSettingsSection('siteIdentity'))),
  ])

  // Kick off independent queries in parallel with the listing pipeline.
  const featurePromise = selectFeaturePosts(featureSeed)
  const sidebarPostsPromise = selectSidebarPosts(
    getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts'),
  )
  const tagsPromise = listAllTags()

  return listingLoader<HomeExtra>({
    rawNum: params.num,
    totalPosts,
    fetchPage: (pageNum, pageSize) =>
      listPublicPostCardsPaginated(pageNum, pageSize, {
        ...filters,
        offset: (pageNum - 1) * homePageSize,
      }).then((r) => r.posts),
    rootPath: '/',
    pageSize: homePageSize,
    mergeTailWhenLessThan,
    metadata: { likes: true, views: true, comments: true },
    seoMode: 'skip-on-first-page',
    allowEmpty: true,
    computeExtra: async ({ resolvedPosts }) => {
      const uniqueCategories = [...new Set(resolvedPosts.map((p) => p.category).filter(Boolean))]
      const [categoryLinks, featurePosts, tags] = await Promise.all([
        getCategoryLinks(uniqueCategories),
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
export const shouldRevalidate = publicShouldRevalidate

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function HomeRoute({ loaderData }: Route.ComponentProps) {
  const { pageNum, totalPage, resolvedPosts, extra } = loaderData
  const rootData = useRouteLoaderData<{ currentUser?: { role: string } | null }>('root')
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

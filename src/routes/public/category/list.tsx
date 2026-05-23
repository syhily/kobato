import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/repos/public-query'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { findCategoryBySlug } from '@/server/infra/db/operations/category'
import { notFound } from '@/server/infra/http/status'
import { metaWithFallback } from '@/server/render/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ params }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const category = await findCategoryBySlug(params.slug)
  if (!category) {
    notFound()
  }

  const rootPath = `/cats/${category.slug}`

  return listingLoader({
    rawNum: params.num,
    totalPosts: await countPublicPosts({
      includeHidden: true,
      includeScheduled: false,
      category: category.name,
    }),
    fetchPage: (pageNum, pageSize) =>
      listPublicPostCardsPaginated(pageNum, pageSize, {
        includeHidden: true,
        includeScheduled: false,
        category: category.name,
      }).then((r) => r.posts),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: category.name,
    description: category.description,
    extra: undefined,
  })
}

export const headers = listingHeaders
export const shouldRevalidate = publicShouldRevalidate

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function CategoryListRoute({ loaderData }: Route.ComponentProps) {
  return (
    <PostListingBody
      title={loaderData.title ?? ''}
      description={loaderData.description}
      resolvedPosts={loaderData.resolvedPosts}
      pageNum={loaderData.pageNum}
      totalPage={loaderData.totalPage}
      rootPath={loaderData.rootPath}
      listingNowIso={loaderData.listingNowIso}
    />
  )
}

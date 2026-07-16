import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { getDbFromContext } from '@/server/domains/auth/context'
import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/repos/public-query/listing'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { findCategoryBySlug } from '@/server/infra/db/operations/category'
import { notFound } from '@/server/infra/http/status'
import { metaWithFallback } from '@/server/render/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, context, params }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const db = getDbFromContext({ request, context })
  const category = await findCategoryBySlug(db, params.slug)
  if (!category) {
    notFound()
  }

  const rootPath = `/cats/${category.slug}`

  return listingLoader(db, {
    rawNum: params.num,
    totalPosts: await countPublicPosts(db, {
      includeHidden: true,
      includeScheduled: false,
      category: category.name,
    }),
    fetchPage: (pageNum, pageSize) =>
      listPublicPostCardsPaginated(db, pageNum, pageSize, {
        includeHidden: true,
        includeScheduled: false,
        category: category.name,
      }),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: category.name,
    description: category.description,
    ogImageUrl: category.og ?? `/images/og/cats/${category.slug}.png`,
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

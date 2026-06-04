import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { getDbFromContext } from '@/server/domains/auth/context'
import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/repos/public-query/listing'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { findTagBySlug } from '@/server/infra/db/operations/tag'
import { notFound } from '@/server/infra/http/status'
import { metaWithFallback } from '@/server/render/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, context, params }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const db = getDbFromContext({ request, context })
  const tag = await findTagBySlug(db, params.slug)
  if (!tag) {
    notFound()
  }

  const rootPath = `/tags/${tag.slug}`

  return listingLoader(db, {
    rawNum: params.num,
    totalPosts: await countPublicPosts(db, {
      includeHidden: true,
      includeScheduled: false,
      tag: tag.name,
    }),
    fetchPage: (pageNum, pageSize) =>
      listPublicPostCardsPaginated(db, pageNum, pageSize, {
        includeHidden: true,
        includeScheduled: false,
        tag: tag.name,
      }).then((r) => r.posts),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: tag.name,
    extra: undefined,
    ogImageUrl: tag.ogImage || undefined,
  })
}

export const headers = listingHeaders
export const shouldRevalidate = publicShouldRevalidate

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function TagListRoute({ loaderData }: Route.ComponentProps) {
  return (
    <PostListingBody
      title={loaderData.title ?? ''}
      resolvedPosts={loaderData.resolvedPosts}
      pageNum={loaderData.pageNum}
      totalPage={loaderData.totalPage}
      rootPath={loaderData.rootPath}
      listingNowIso={loaderData.listingNowIso}
    />
  )
}

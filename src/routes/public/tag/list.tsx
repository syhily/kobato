import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { countPublicPosts, listPublicPostCardsPaginated } from '@/server/domains/posts/services/public-query'
import { findTagBySlug } from '@/server/domains/taxonomies/tags/service'
import { listingLoader } from '@/server/http/loaders/listing'
import { listingHeaders } from '@/server/http/loaders/route-exports'
import { getRequestContext } from '@/server/http/request-context'
import { notFound } from '@/server/infra/http/status'
import { metaWithFallback } from '@/shared/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, context, params }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const { db } = getRequestContext({ request, context })
  const tag = await findTagBySlug(db, params.slug)
  if (!tag) {
    notFound()
  }

  const rootPath = `/tags/${tag.slug}`
  const filters = {
    includeHidden: true,
    includeScheduled: false,
    tag: tag.name,
  }

  return listingLoader(db, {
    rawNum: params.num,
    totalPosts: await countPublicPosts(db, filters),
    fetchPage: ({ pageNum, limit, offset }) => listPublicPostCardsPaginated(db, pageNum, limit, { ...filters, offset }),
    rootPath,
    metadata: { likes: true, views: true, comments: false },
    title: tag.name,
    extra: undefined,
    ogImageUrl: tag.ogImage || undefined,
  })
}

export const headers = listingHeaders

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

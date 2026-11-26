import type { PublicListingLoaderData } from '@kobato/catalog/listing'

import { metaWithFallback } from '@kobato/catalog/seo/meta'
import { getSayakaContext } from '@sayaka/server/request-context'
import { listingHeaders } from '@sayaka/server/route-cache-headers'
import { sinkUnhandledRejection, unwrapListing } from '@sayaka/server/unwrap'
import { PostListingBody } from '@sayaka/ui/post/PostListViews'
import { data } from 'react-router'

import type { Route } from './+types/list'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const listingPromise = sinkUnhandledRejection(
    ctx.client.public.content.posts.list({
      scope: { type: 'category', slug: params.slug },
      num: params.num,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )
  const boot = await ctx.bootstrap()
  const { etag, listing } = await unwrapListing(listingPromise, boot.i18n.locale)
  return data({ ...listing, eid: ctx.analyticsEventId } satisfies PublicListingLoaderData, {
    headers: { ETag: etag },
  })
}

export const headers = listingHeaders

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

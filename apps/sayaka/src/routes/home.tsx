import type { HomeExtra } from '@kobato/api/contracts/public/content'
import type { PublicListingLoaderData } from '@kobato/catalog/listing'

import { metaWithFallback } from '@kobato/catalog/seo/meta'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { getSayakaContext } from '@sayaka/server/request-context'
import { listingHeaders } from '@sayaka/server/route-cache-headers'
import { sinkUnhandledRejection, unwrapListing } from '@sayaka/server/unwrap'
import { HomeLayoutBody } from '@sayaka/ui/post/PostListViews'
import { data } from 'react-router'

import type { Route } from './+types/home'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const listingPromise = sinkUnhandledRejection(
    ctx.client.public.content.home({
      num: params.num,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )
  const boot = await ctx.bootstrap()
  const { etag, listing } = await unwrapListing(listingPromise, boot.i18n.locale)
  return data({ ...listing, eid: ctx.analyticsEventId } satisfies PublicListingLoaderData<HomeExtra>, {
    headers: { ETag: etag },
  })
}

export const headers = listingHeaders

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function HomeRoute({ loaderData, matches }: Route.ComponentProps) {
  const { pageNum, totalPage, resolvedPosts, extra } = loaderData
  const rootData = unsafeCast<{ currentUser?: { role: string } | null } | undefined>(matches[0]?.loaderData)
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

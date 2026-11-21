import type { PublicListingLoaderData } from '@kobato/catalog/listing'
import type { HomeExtra } from '@kobato/contracts/content'

import { metaWithFallback } from '@kobato/seo/meta'
import { listingHeaders } from '@kobato/server/http/route-cache-headers'
import { createSsrCaller, unwrapListing } from '@kobato/server/http/ssr-caller'
import { HomeLayoutBody } from '@kobato/web-public/ui/post/PostListViews'
import { data } from 'react-router'

import type { Route } from './+types/home'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, analyticsEventId, localization } = createSsrCaller({ request, context })
  const { etag, listing } = await unwrapListing(
    caller.content.home({
      num: params.num,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
    localization,
  )
  return data({ ...listing, eid: analyticsEventId } satisfies PublicListingLoaderData<HomeExtra>, {
    headers: { ETag: etag },
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

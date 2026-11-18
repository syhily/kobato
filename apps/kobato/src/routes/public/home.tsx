import type { PublicListingLoaderData } from '@kobato/catalog/listing.ts'
import type { HomeExtra } from '@kobato/contracts/content.ts'

import { metaWithFallback } from '@kobato/seo/meta.ts'
import { listingHeaders } from '@kobato/server/http/loaders/route-exports.ts'
import { createSsrCaller, unwrapListing } from '@kobato/server/http/ssr-caller.ts'
import { HomeLayoutBody } from '@kobato/web-public/ui/post/PostListViews.tsx'
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

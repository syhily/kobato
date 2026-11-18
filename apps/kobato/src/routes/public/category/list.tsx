import type { PublicListingLoaderData } from '@kobato/catalog/listing.ts'

import { metaWithFallback } from '@kobato/seo/meta.ts'
import { listingHeaders } from '@kobato/server/http/route-cache-headers.ts'
import { createSsrCaller, unwrapListing } from '@kobato/server/http/ssr-caller.ts'
import { PostListingBody } from '@kobato/web-public/ui/post/PostListViews.tsx'
import { data } from 'react-router'

import type { Route } from './+types/list'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, analyticsEventId, localization } = createSsrCaller({ request, context })
  const { etag, listing } = await unwrapListing(
    caller.content.posts.list({
      scope: { type: 'category', slug: params.slug },
      num: params.num,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
    localization,
  )
  return data({ ...listing, eid: analyticsEventId } satisfies PublicListingLoaderData, {
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

import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { searchLoader } from '@/server/http/loaders/search'
import { metaWithFallback } from '@/server/render/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, params, context }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  let clientAddress: string | undefined
  try {
    clientAddress = getRouteRequestContext({ request, context }).clientAddress
  } catch {
    // Test environment may not provide a valid RouterContextProvider.
  }
  return searchLoader({ keyword: params.keyword, num: params.num, clientAddress, request })
}

export const headers = listingHeaders
export const shouldRevalidate = publicShouldRevalidate

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return metaWithFallback({ loaderData, matches })
}

export default function SearchListRoute({ loaderData }: Route.ComponentProps) {
  return (
    <PostListingBody
      title={loaderData.title ?? ''}
      resolvedPosts={loaderData.resolvedPosts}
      pageNum={loaderData.pageNum}
      totalPage={loaderData.totalPage}
      rootPath={loaderData.rootPath}
      pagination="auto"
      listingNowIso={loaderData.listingNowIso}
    />
  )
}

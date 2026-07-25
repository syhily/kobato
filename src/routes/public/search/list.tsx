import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { getDbFromContext, getPoolFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { listingHeaders } from '@/server/http/loaders/route-exports'
import { searchLoader } from '@/server/http/loaders/search'
import { metaWithFallback } from '@/shared/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, params, context }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const db = getDbFromContext({ request, context })
  const pool = getPoolFromContext({ request, context })
  let clientAddress: string | undefined
  try {
    clientAddress = getRouteRequestContext({ request, context }).clientAddress
  } catch {
    // Test environment may not provide a valid RouterContextProvider.
  }
  return searchLoader(db, pool, { keyword: params.keyword, num: params.num, clientAddress, request })
}

export const headers = listingHeaders

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

import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { listingHeaders } from '@/server/http/loaders/route-exports'
import { searchLoader } from '@/server/http/loaders/search'
import { getRequestContext } from '@/server/http/request-context'
import { metaWithFallback } from '@/shared/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, params, context }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const rc = getRequestContext({ request, context })
  return searchLoader(rc.db, { keyword: params.keyword, num: params.num, auditContext: rc })
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

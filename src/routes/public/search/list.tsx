import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, unwrapListing } from '@/server/http/ssr-caller'
import { metaWithFallback } from '@/shared/seo/meta'
import { PostListingBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/list'

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  return unwrapListing(caller.content.search({ keyword: params.keyword, num: params.num }))
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

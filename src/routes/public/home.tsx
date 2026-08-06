import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, unwrapListing } from '@/server/http/ssr-caller'
import { metaWithFallback } from '@/shared/seo/meta'
import { HomeLayoutBody } from '@/ui/public/post/PostListViews'

import type { Route } from './+types/home'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  return unwrapListing(caller.content.home({ num: params.num }))
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

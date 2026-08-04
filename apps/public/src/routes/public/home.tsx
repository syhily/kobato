import type { HomeExtra, ListingPageLoaderData } from '@kobato/shared/types/catalog'

import { listingHeaders } from '@kobato/shared/http/headers'
import { metaWithFallback } from '@kobato/shared/seo/meta'
import { HomeLayoutBody } from '@kobato/ui/public/post/PostListViews'
import { redirect } from 'react-router'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/home'

import { getPublicClient } from './client'

export async function loader({
  request,
  context,
  params,
}: Route.LoaderArgs): Promise<ListingPageLoaderData<HomeExtra>> {
  const fctx = getFrontendContext({ request, context })
  const data = await getPublicClient(fctx).home({ num: params.num })
  if ('redirectTo' in data) {
    throw redirect(data.redirectTo)
  }
  return data
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

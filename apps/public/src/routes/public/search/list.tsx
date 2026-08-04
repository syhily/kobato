import type { ListingPageLoaderData } from '@kobato/shared/types/catalog'

import { listingHeaders } from '@kobato/shared/http/headers'
import { metaWithFallback } from '@kobato/shared/seo/meta'
import { PostListingBody } from '@kobato/ui/public/post/PostListViews'
import { redirect } from 'react-router'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/list'

import { getPublicClient } from '../client'

export async function loader({ request, params, context }: Route.LoaderArgs): Promise<ListingPageLoaderData> {
  const fctx = getFrontendContext({ request, context })
  const data = await getPublicClient(fctx).search({ keyword: params.keyword, num: params.num })
  if ('redirectTo' in data) {
    throw redirect(data.redirectTo)
  }
  return data
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

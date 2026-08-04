import { listingHeaders } from '@kobato/shared/http/headers'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { ArchivesBody } from '@kobato/ui/public/post/ArchivesBody'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/archives'

import { getPublicClient } from './client'

export async function loader({ request, context }: Route.LoaderArgs) {
  const fctx = getFrontendContext({ request, context })
  return getPublicClient(fctx).archives({})
}

export const headers = listingHeaders

export const meta = titleMeta('归档')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

import { data } from 'react-router'

import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, unwrapListingPayload } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, analyticsEventId, localization } = createSsrCaller({ request, context })
  const { etag, payload } = await unwrapListingPayload(
    caller.content.archives({ ifNoneMatch: request.headers.get('if-none-match') ?? undefined }),
    localization,
  )
  return data({ ...payload, eid: analyticsEventId }, { headers: { ETag: etag } })
}

export const headers = listingHeaders

export const meta = titleMeta('meta.title.public.archives')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

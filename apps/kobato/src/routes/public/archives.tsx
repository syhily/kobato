import { listingHeaders } from '@kobato/server/http/loaders/route-exports.ts'
import { createSsrCaller, unwrapListingPayload } from '@kobato/server/http/ssr-caller.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { ArchivesBody } from '@kobato/web/ui/public/post/ArchivesBody.tsx'
import { data } from 'react-router'

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

import { titleMeta } from '@sayaka/seo/title-meta'
import { getSayakaContext } from '@sayaka/server/request-context'
import { listingHeaders } from '@sayaka/server/route-cache-headers'
import { sinkUnhandledRejection, unwrapListingPayload } from '@sayaka/server/unwrap'
import { ArchivesBody } from '@sayaka/ui/post/ArchivesBody'
import { data } from 'react-router'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const payloadPromise = sinkUnhandledRejection(
    ctx.client.public.content.archives({
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )
  const boot = await ctx.bootstrap()
  const { etag, payload } = await unwrapListingPayload(payloadPromise, boot.i18n.locale)
  return data({ ...payload, eid: ctx.analyticsEventId }, { headers: { ETag: etag } })
}

export const headers = listingHeaders

export const meta = titleMeta('meta.title.public.archives')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

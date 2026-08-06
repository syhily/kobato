import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  return caller.content.archives()
}

export const headers = listingHeaders

export const meta = titleMeta('归档')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

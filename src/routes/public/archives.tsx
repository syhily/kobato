import { getClientPostsWithMetadata, listClientPosts } from '@/server/domains/posts/services/public-query'
import { listingHeaders } from '@/server/http/loaders/route-exports'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { toListingPostCard } from '@/shared/types/catalog'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getRequestContext({ request, context })
  const listingNowIso = new Date().toISOString()
  // Archives promises completeness: list every live post. The bound is explicit
  // (the helper otherwise defaults to 200) and far above any realistic personal
  // blog; if it ever bites, the fix is year-grouped pagination, not a lower cap.
  // Audit P1-22 reviewed this and deferred that work behind a scale trigger:
  // revisit when a deployment passes ~2,000 live posts (~6-7 batched queries,
  // ~1-3MB payload at the 10k cap — no per-post fan-out).
  const rawPosts = await listClientPosts(db, { includeHidden: true, includeScheduled: false, limit: 10_000 })
  const posts = rawPosts.map(toListingPostCard)
  const resolvedPosts = await getClientPostsWithMetadata(db, posts, {
    likes: true,
    views: true,
    comments: false,
  })
  return {
    resolvedPosts,
    listingNowIso,
  }
}

export const headers = listingHeaders

export const meta = titleMeta('归档')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

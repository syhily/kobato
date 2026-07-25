import { getDbFromContext } from '@/server/domains/auth/context'
import { getClientPostsWithMetadata, listClientPosts } from '@/server/domains/posts/repos/public-query/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { titleMeta } from '@/shared/seo/title-meta'
import { toListingPostCard } from '@/shared/types/catalog'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  const listingNowIso = new Date().toISOString()
  // Archives promises completeness: list every live post. The bound is explicit
  // (the helper otherwise defaults to 200) and far above any realistic personal
  // blog; if it ever bites, the fix is year-grouped pagination, not a lower cap.
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
export const shouldRevalidate = publicShouldRevalidate

export const meta = titleMeta('归档')

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

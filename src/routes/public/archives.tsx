import { getDbFromContext } from '@/server/domains/auth/context'
import { getClientPostsWithMetadata, listClientPosts } from '@/server/domains/posts/repos/public-query/listing'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { toListingPostCard } from '@/shared/types/catalog'
import { ArchivesBody } from '@/ui/public/post/ArchivesBody'

import type { Route } from './+types/archives'

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  const listingNowIso = new Date().toISOString()
  const rawPosts = await listClientPosts(db, { includeHidden: true, includeScheduled: false })
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

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '归档' }, bundleFromMatches(matches))
}

export default function ArchivesRoute({ loaderData }: Route.ComponentProps) {
  return <ArchivesBody resolvedPosts={loaderData.resolvedPosts} listingNowIso={loaderData.listingNowIso} />
}

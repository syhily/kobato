import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ListPublicPostsFilters } from '@/server/domains/posts/repos/shared'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { findContentsByIds } from '@/server/domains/content/repos/query'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toCmsPost } from '@/server/domains/posts/projection'

export async function hydratePostImages(db: NodePgDatabase, posts: Post[]): Promise<void> {
  await hydrateImageRefs(
    db,
    posts,
    (p) => p.cover,
    (p, lookup) => {
      p.coverThumbhash = lookup?.thumbhash
      if (lookup?.publicUrl != null) {
        p.cover = lookup.publicUrl
      }
    },
  )
}

export async function hydrateClientPostCovers(db: NodePgDatabase, posts: ClientPost[]): Promise<void> {
  await hydrateImageRefs(
    db,
    posts,
    (p) => p.cover,
    (p, lookup) => {
      p.coverThumbhash = lookup?.thumbhash
      if (lookup?.publicUrl != null) {
        p.cover = lookup.publicUrl
      }
    },
  )
}

export function buildPublicPostFilters(
  options?: PostVisibilityOptions,
): Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> {
  return {
    includeHidden: options?.includeHidden ?? false,
    includeScheduled: options?.includeScheduled ?? false,
  }
}

/** Join published `content` rows so callers receive a real `Post` with `body` (RSS, detail routes, etc.). */
export async function hydratePostMetasToFullPosts(db: NodePgDatabase, metas: PostMetaRow[]): Promise<Post[]> {
  if (metas.length === 0) {
    return []
  }
  const revisionIds = metas.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, Awaited<ReturnType<typeof findContentsByIds>>[number]>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(db, revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }
  const posts = metas.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPost(meta, revision)
  })
  await hydratePostImages(db, posts)
  return posts
}

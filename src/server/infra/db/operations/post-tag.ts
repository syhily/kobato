import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, inArray } from 'drizzle-orm'

import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag } from '@/server/infra/db/schema/taxonomy'

export async function setPostTags(db: NodePgDatabase, postId: bigint, tagIds: bigint[]): Promise<void> {
  await db.delete(postTag).where(eq(postTag.postId, postId))
  if (tagIds.length === 0) {
    return
  }
  await db
    .insert(postTag)
    .values(tagIds.map((tagId) => ({ postId, tagId })))
    .onConflictDoNothing()
}

export async function findTagNamesByPostIds(db: NodePgDatabase, postIds: bigint[]): Promise<Map<bigint, string[]>> {
  const map = new Map<bigint, string[]>()
  if (postIds.length === 0) {
    return map
  }
  const rows = await db
    .select({ postId: postTag.postId, name: tag.name })
    .from(postTag)
    .innerJoin(tag, eq(postTag.tagId, tag.id))
    .where(inArray(postTag.postId, postIds))
    .orderBy(tag.name)
  for (const row of rows) {
    const list = map.get(row.postId)
    if (list) {
      list.push(row.name)
    } else {
      map.set(row.postId, [row.name])
    }
  }
  return map
}

export async function findTagNamesByPostId(db: NodePgDatabase, postId: bigint): Promise<string[]> {
  const rows = await db
    .select({ name: tag.name })
    .from(postTag)
    .innerJoin(tag, eq(postTag.tagId, tag.id))
    .where(eq(postTag.postId, postId))
    .orderBy(tag.name)
  return rows.map((r) => r.name)
}

import { eq, inArray } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag } from '@/server/infra/db/schema/taxonomy'

// Sync (node:sqlite): called inside the upsert transaction.
export function setPostTags(db: Database, postId: number, tagIds: number[]): void {
  db.delete(postTag).where(eq(postTag.postId, postId)).run()
  if (tagIds.length === 0) {
    return
  }
  db.insert(postTag)
    .values(tagIds.map((tagId) => ({ postId, tagId })))
    .onConflictDoNothing()
    .run()
}

export async function findTagNamesByPostIds(db: Database, postIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
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

export async function findTagNamesByPostId(db: Database, postId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tag.name })
    .from(postTag)
    .innerJoin(tag, eq(postTag.tagId, tag.id))
    .where(eq(postTag.postId, postId))
    .orderBy(tag.name)
  return rows.map((r) => r.name)
}

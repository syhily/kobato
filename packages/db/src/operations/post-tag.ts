import type { Database } from '@kobato/db/database'

import { sqliteOf } from '@kobato/db/database'
import { postTag } from '@kobato/db/schema/post-tag'
import { tag } from '@kobato/db/schema/taxonomy'
import { eq, inArray } from 'drizzle-orm'

export function setPostTags(db: Database, postId: number, tagIds: number[]): void {
  sqliteOf(db).delete(postTag).where(eq(postTag.postId, postId)).run()
  if (tagIds.length === 0) {
    return
  }
  sqliteOf(db)
    .insert(postTag)
    .values(tagIds.map((tagId) => ({ postId, tagId })))
    .onConflictDoNothing()
    .run()
}

export async function findTagNamesByPostIds(db: Database, postIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
  if (postIds.length === 0) {
    return map
  }
  const rows = await sqliteOf(db)
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
  const rows = await sqliteOf(db)
    .select({ name: tag.name })
    .from(postTag)
    .innerJoin(tag, eq(postTag.tagId, tag.id))
    .where(eq(postTag.postId, postId))
    .orderBy(tag.name)
  return rows.map((r) => r.name)
}

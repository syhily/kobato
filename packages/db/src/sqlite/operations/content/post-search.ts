import type { Database } from '@kobato/db/sqlite/database'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { escapeLikePattern, likeEscape } from '@kobato/db/sqlite/like-escape'
import { postSearchIndex } from '@kobato/db/sqlite/schema/content'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { and, desc, eq, or, sql, type SQL } from 'drizzle-orm'

export function upsertPostSearchIndex(db: Database, postId: number, plainText: string): void {
  const now = new Date()
  sqliteOf(db)
    .insert(postSearchIndex)
    .values({ postId, plainText, updatedAt: now })
    .onConflictDoUpdate({
      target: postSearchIndex.postId,
      set: { plainText, updatedAt: now },
    })
    .run()
}

export function removePostSearchIndex(db: Database, postId: number): void {
  sqliteOf(db).delete(postSearchIndex).where(eq(postSearchIndex.postId, postId)).run()
}

export async function searchPostSlugs(
  db: Database,
  query: string,
  options: { asOf?: Date; includeScheduled?: boolean } = {},
): Promise<string[]> {
  const conditions: SQL[] = [
    sql`${postMetaTable.deletedAt} IS NULL`,
    sql`${postMetaTable.published} = 1`,
    sql`${postMetaTable.publishedRevisionId} IS NOT NULL`,
  ]
  if (options.includeScheduled !== true) {
    const asOf = options.asOf ?? new Date()
    conditions.push(sql`${postMetaTable.publishedAt} <= ${asOf.getTime()}`)
  }
  const corpus = or(
    likeEscape(postMetaTable.title, query),
    likeEscape(postMetaTable.summary, query),
    sql`COALESCE(${postSearchIndex.plainText}, '') LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`,
  )
  const rows = await sqliteOf(db)
    .select({ slug: postMetaTable.slug })
    .from(postMetaTable)
    .leftJoin(postSearchIndex, eq(postMetaTable.id, postSearchIndex.postId))
    .where(and(...conditions, corpus))
    .orderBy(desc(postMetaTable.publishedAt))
  return rows.map((r) => r.slug)
}

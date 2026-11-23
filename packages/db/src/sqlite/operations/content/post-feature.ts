import type { Database } from '@kobato/db/sqlite/database'
import type { PostMetaRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { liveEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

export async function listPinnedLiveVisiblePostMetas(
  db: Database,
  limit: number,
  now = new Date(),
): Promise<PostMetaRow[]> {
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { asOf: now }),
        eq(postMetaTable.visible, true),
        isNotNull(postMetaTable.pinnedAt),
      ),
    )
    .orderBy(desc(postMetaTable.pinnedAt))
    .limit(limit)
}

export async function listLiveVisiblePostIds(
  db: Database,
  limit: number | undefined,
  now = new Date(),
): Promise<number[]> {
  const base = sqliteOf(db)
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(and(liveEntityWhere(postMetaTable, { asOf: now }), eq(postMetaTable.visible, true)))
    .orderBy(desc(postMetaTable.firstPublishedAt))
  const rows = limit !== undefined ? await base.limit(limit) : await base
  return rows.map((row) => row.id)
}

export async function listLiveVisiblePostMetasWithCover(
  db: Database,
  limit: number,
  now = new Date(),
): Promise<PostMetaRow[]> {
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { asOf: now }),
        eq(postMetaTable.visible, true),
        sql`${postMetaTable.cover} <> ''`,
      ),
    )
    .orderBy(desc(postMetaTable.firstPublishedAt))
    .limit(limit)
}

export async function listVisibleLivePostIdsOrderedById(db: Database): Promise<number[]> {
  const rows = await sqliteOf(db)
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(and(liveEntityWhere(postMetaTable), eq(postMetaTable.visible, true)))
    .orderBy(asc(postMetaTable.id))
  return rows.map((row) => row.id)
}

export async function listPostMetasByIds(db: Database, ids: readonly number[]): Promise<PostMetaRow[]> {
  if (ids.length === 0) {
    return []
  }
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(inArray(postMetaTable.id, [...ids]))
}

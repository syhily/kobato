import type { ContentType } from '@kobato/server/domains/content/schemas/revision'
import type { Database } from '@kobato/server/infra/db/database'
import type { ContentRow } from '@kobato/server/infra/db/types'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { and, desc, eq, inArray } from 'drizzle-orm'

// Sync (node:sqlite): called inside the restore transaction.
export function findContentById(db: Database, id: number): ContentRow | null {
  const rows = db.select().from(contentTable).where(eq(contentTable.id, id)).limit(1).all()
  return rows[0] ?? null
}

export async function findContentsByIds(db: Database, ids: number[]): Promise<ContentRow[]> {
  if (ids.length === 0) {
    return []
  }
  return db.select().from(contentTable).where(inArray(contentTable.id, ids))
}

/**
 * Batch-join the published `content` revision for a list of metas —
 * structural over post and page rows (like `LiveContentColumns`), since
 * both declare `publishedRevisionId` identically. Returns a map keyed by
 * revision id so callers resolve `meta.publishedRevisionId` in O(1).
 */
export async function hydratePublishedRevisions(
  db: Database,
  rows: readonly { publishedRevisionId: number | null }[],
): Promise<Map<number, ContentRow>> {
  const map = new Map<number, ContentRow>()
  const ids = rows.map((row) => row.publishedRevisionId).filter((id): id is number => id !== null)
  if (ids.length === 0) {
    return map
  }
  const revisions = await findContentsByIds(db, ids)
  for (const revision of revisions) {
    map.set(revision.id, revision)
  }
  return map
}

export async function findLatestRevision(db: Database, type: ContentType, ownerId: number): Promise<ContentRow | null> {
  const rows = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function findLatestDraft(db: Database, type: ContentType, ownerId: number): Promise<ContentRow | null> {
  const rows = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId), eq(contentTable.status, 'draft')))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function listRevisions(
  db: Database,
  type: ContentType,
  ownerId: number,
  limit = 100,
): Promise<ContentRow[]> {
  return db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(limit)
}

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, inArray } from 'drizzle-orm'

import type { ContentType } from '@/server/domains/content/schemas/revision'
import type { ContentRow } from '@/server/infra/db/types'

import { content as contentTable } from '@/server/infra/db/schema/content'

export async function findContentById(db: NodePgDatabase, id: bigint): Promise<ContentRow | null> {
  const rows = await db.select().from(contentTable).where(eq(contentTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findContentsByIds(db: NodePgDatabase, ids: bigint[]): Promise<ContentRow[]> {
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
 * Empty input (or all-null revision ids) short-circuits without a query.
 */
export async function hydratePublishedRevisions(
  db: NodePgDatabase,
  rows: readonly { publishedRevisionId: bigint | null }[],
): Promise<Map<bigint, ContentRow>> {
  const map = new Map<bigint, ContentRow>()
  const ids = rows.map((row) => row.publishedRevisionId).filter((id): id is bigint => id !== null)
  if (ids.length === 0) {
    return map
  }
  const revisions = await findContentsByIds(db, ids)
  for (const revision of revisions) {
    map.set(revision.id, revision)
  }
  return map
}

export async function findLatestRevision(
  db: NodePgDatabase,
  type: ContentType,
  ownerId: bigint,
): Promise<ContentRow | null> {
  const rows = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function findLatestDraft(
  db: NodePgDatabase,
  type: ContentType,
  ownerId: bigint,
): Promise<ContentRow | null> {
  const rows = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId), eq(contentTable.status, 'draft')))
    .orderBy(desc(contentTable.revisionNo))
    .limit(1)
  return rows[0] ?? null
}

export async function listRevisions(
  db: NodePgDatabase,
  type: ContentType,
  ownerId: bigint,
  limit = 100,
): Promise<ContentRow[]> {
  return db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.type, type), eq(contentTable.ownerId, ownerId)))
    .orderBy(desc(contentTable.revisionNo))
    .limit(limit)
}

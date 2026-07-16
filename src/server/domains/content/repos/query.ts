import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, inArray } from 'drizzle-orm'

import type { ContentType } from '@/server/domains/content/schema'
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

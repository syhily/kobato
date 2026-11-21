import type { Database } from '@kobato/db/database'
import type { NewTag, TagRow } from '@kobato/db/types'

import { likeEscape } from '@kobato/db/like-escape'
import { tag } from '@kobato/db/schema/taxonomy'
import { asc, count, eq, inArray, or, type SQL } from 'drizzle-orm'

export interface AdminTagsListFilters {
  q?: string
  offset?: number
  limit?: number
}

function buildAdminTagWhere(filters: AdminTagsListFilters): SQL | undefined {
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    return or(likeEscape(tag.name, q), likeEscape(tag.slug, q))
  }
  return undefined
}

export async function listAdminTagRows(db: Database, filters: AdminTagsListFilters = {}): Promise<TagRow[]> {
  const where = buildAdminTagWhere(filters)
  const q = where
    ? db.select().from(tag).where(where).orderBy(asc(tag.name))
    : db.select().from(tag).orderBy(asc(tag.name))
  if (filters.limit !== undefined && filters.limit > 0) {
    if (filters.offset !== undefined && filters.offset > 0) {
      return q.limit(filters.limit).offset(filters.offset)
    }
    return q.limit(filters.limit)
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    return q.offset(filters.offset)
  }
  return q
}

export async function countAdminTags(db: Database, filters: AdminTagsListFilters = {}): Promise<number> {
  const where = buildAdminTagWhere(filters)
  const rows = where
    ? await db.select({ value: count() }).from(tag).where(where)
    : await db.select({ value: count() }).from(tag)
  return rows[0]?.value ?? 0
}

export async function findTagById(db: Database, id: number): Promise<TagRow | null> {
  const rows = await db.select().from(tag).where(eq(tag.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findTagByName(db: Database, name: string): Promise<TagRow | null> {
  const rows = await db.select().from(tag).where(eq(tag.name, name)).limit(1)
  return rows[0] ?? null
}

export function findTagsByNames(db: Database, names: string[]): TagRow[] {
  if (names.length === 0) {
    return []
  }
  return db.select().from(tag).where(inArray(tag.name, names)).orderBy(tag.name).all()
}

export async function insertTag(db: Database, values: NewTag): Promise<TagRow> {
  const now = new Date()
  const rows = await db
    .insert(tag)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateTag(db: Database, id: number, values: Partial<NewTag>): Promise<TagRow | null> {
  const rows = await db
    .update(tag)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tag.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteTag(db: Database, id: number): Promise<boolean> {
  const result = await db.delete(tag).where(eq(tag.id, id)).returning({ id: tag.id })
  return result.length > 0
}

export function seedTagsIfMissing(db: Database, valuesList: NewTag[], tx = db): void {
  if (valuesList.length === 0) {
    return
  }
  const now = new Date()
  tx.insert(tag)
    .values(valuesList.map((values) => ({ ...values, createdAt: now, updatedAt: now })))
    .onConflictDoNothing({ target: tag.name })
    .run()
}

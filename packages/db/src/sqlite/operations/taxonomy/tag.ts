import type { Database } from '@kobato/db/sqlite/database'
import type { NewTag, TagRow } from '@kobato/db/sqlite/types'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { likeEscape } from '@kobato/db/sqlite/like-escape'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { tag } from '@kobato/db/sqlite/schema/taxonomy'
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
    ? sqliteOf(db).select().from(tag).where(where).orderBy(asc(tag.name))
    : sqliteOf(db).select().from(tag).orderBy(asc(tag.name))
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
    ? await sqliteOf(db).select({ value: count() }).from(tag).where(where)
    : await sqliteOf(db).select({ value: count() }).from(tag)
  return rows[0]?.value ?? 0
}

export async function findTagById(db: Database, id: number): Promise<TagRow | null> {
  const rows = await sqliteOf(db).select().from(tag).where(eq(tag.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findTagByName(db: Database, name: string): Promise<TagRow | null> {
  const rows = await sqliteOf(db).select().from(tag).where(eq(tag.name, name)).limit(1)
  return rows[0] ?? null
}

export function findTagsByNames(db: Database, names: string[]): TagRow[] {
  if (names.length === 0) {
    return []
  }
  return sqliteOf(db).select().from(tag).where(inArray(tag.name, names)).orderBy(tag.name).all()
}

export async function insertTag(db: Database, values: NewTag): Promise<TagRow> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .insert(tag)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateTag(db: Database, id: number, values: Partial<NewTag>): Promise<TagRow | null> {
  const rows = await sqliteOf(db)
    .update(tag)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tag.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteTag(db: Database, id: number): Promise<boolean> {
  const result = await sqliteOf(db).delete(tag).where(eq(tag.id, id)).returning({ id: tag.id })
  return result.length > 0
}

export function seedTagsIfMissing(db: Database, valuesList: NewTag[]): void {
  seedTagsIfMissingTx(sqliteOf(db), valuesList)
}

export function seedTagsIfMissingTx(tx: NodeSQLiteDatabase, valuesList: NewTag[]): void {
  if (valuesList.length === 0) {
    return
  }
  const now = new Date()
  tx.insert(tag)
    .values(valuesList.map((values) => ({ ...values, createdAt: now, updatedAt: now })))
    .onConflictDoNothing({ target: tag.name })
    .run()
}

export async function findTagBySlug(db: Database, slug: string): Promise<TagRow | null> {
  const rows = await sqliteOf(db).select().from(tag).where(eq(tag.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function listTagNameSlugRows(db: Database): Promise<Array<{ name: string; slug: string }>> {
  return sqliteOf(db).select({ name: tag.name, slug: tag.slug }).from(tag).orderBy(asc(tag.name))
}

export async function findTagNameSlugByNames(
  db: Database,
  names: readonly string[],
): Promise<Array<{ name: string; slug: string }>> {
  if (names.length === 0) {
    return []
  }
  const unique = [...new Set(names)]
  return sqliteOf(db).select({ name: tag.name, slug: tag.slug }).from(tag).where(inArray(tag.name, unique))
}

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

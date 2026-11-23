import type { Database } from '@kobato/db/sqlite/database'
import type { EntityType } from '@kobato/db/sqlite/target'
import type { NewPageMeta, NewPostMeta, PageMetaRow, PostMetaRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { page as pageMetaTable } from '@kobato/db/sqlite/schema/page'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

export type AnyNewMeta = NewPostMeta & NewPageMeta
export type AnyMetaRow = PostMetaRow | PageMetaRow

/**
 * Raised inside entity mutation transactions when the requested slug is already taken by another entity (own-table
 * collision or cross-entity `slug_registry` occupant). The server maps it to its user-facing conflict error.
 */
export class SlugOccupiedError extends Error {
  constructor(
    readonly slug: string,
    readonly occupantType: EntityType,
  ) {
    super(`slug '${slug}' is taken by a ${occupantType}`)
    this.name = 'SlugOccupiedError'
  }
}

export interface LiveGateOptions {
  asOf?: Date
  includeScheduled?: boolean
}

export function liveEntityWhere(
  table: typeof postMetaTable | typeof pageMetaTable,
  options: LiveGateOptions = {},
): SQL {
  const conditions: SQL[] = [isNull(table.deletedAt), eq(table.published, true), isNotNull(table.publishedRevisionId)]
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    conditions.push(sql`${table.publishedAt} <= ${asOf.getTime()}`)
  }
  return and(...conditions)!
}

export function promotedEntityWhere(table: typeof postMetaTable | typeof pageMetaTable): SQL {
  return and(eq(table.published, true), isNotNull(table.publishedRevisionId))!
}

export function metaTableFor(entityType: EntityType) {
  return entityType === 'page' ? pageMetaTable : postMetaTable
}

export function findEntityMetaById(db: Database, entityType: EntityType, id: number): AnyMetaRow | null {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db).select().from(table).where(eq(table.id, id)).limit(1).all()
  return rows[0] ?? null
}

export function findEntityMetaBySlug(db: Database, entityType: EntityType, slug: string): AnyMetaRow | null {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db).select().from(table).where(eq(table.slug, slug)).limit(1).all()
  return rows[0] ?? null
}

export function findPublicEntityMetaBySlug(db: Database, entityType: EntityType, slug: string): AnyMetaRow | null {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db)
    .select()
    .from(table)
    .where(and(eq(table.slug, slug), isNull(table.deletedAt)))
    .limit(1)
    .all()
  return rows[0] ?? null
}

export function insertEntityMeta(db: Database, entityType: EntityType, values: NewPostMeta | NewPageMeta): AnyMetaRow {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db)
    .insert(table)
    .values(values as AnyNewMeta)
    .returning()
    .all()
  return rows[0]!
}

export function updateEntityMetaById(
  db: Database,
  entityType: EntityType,
  id: number,
  patch: Partial<NewPostMeta> | Partial<NewPageMeta>,
): AnyMetaRow | null {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db)
    .update(table)
    .set({ ...unsafeCast<AnyNewMeta>(patch), updatedAt: new Date() })
    .where(eq(table.id, id))
    .returning()
    .all()
  return rows[0] ?? null
}

export function softDeleteEntityMeta(db: Database, entityType: EntityType, id: number): boolean {
  const table = metaTableFor(entityType)
  const now = new Date()
  const rows = sqliteOf(db)
    .update(table)
    .set(unsafeCast<AnyNewMeta>({ deletedAt: now, updatedAt: now }))
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .returning({ id: table.id })
    .all()
  return rows.length > 0
}

export function restoreEntityMeta(db: Database, entityType: EntityType, id: number): boolean {
  const table = metaTableFor(entityType)
  const rows = sqliteOf(db)
    .update(table)
    .set(unsafeCast<AnyNewMeta>({ deletedAt: null, updatedAt: new Date() }))
    .where(eq(table.id, id))
    .returning({ id: table.id })
    .all()
  return rows.length > 0
}

import type { Database } from '@kobato/db/sqlite/database'
import type { AnyMetaRow, AnyNewMeta } from '@kobato/db/sqlite/operations/content/entity-meta'
import type { EntityType } from '@kobato/db/sqlite/target'
import type { ContentRow, NewPageMeta, NewPostMeta } from '@kobato/db/sqlite/types'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { isUniqueConstraintError } from '@kobato/db/sqlite/errors'
import { metaTableFor, SlugOccupiedError } from '@kobato/db/sqlite/operations/content/entity-meta'
import { slugRegistry } from '@kobato/db/sqlite/schema/config'
import { content as contentTable, postSearchIndex } from '@kobato/db/sqlite/schema/content'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, eq, inArray, isNull } from 'drizzle-orm'

type SqliteTx = NodeSQLiteDatabase

export function reserveSlugTx(
  tx: SqliteTx,
  entityType: EntityType,
  slug: string,
  ownEntityId: number | undefined,
): void {
  const table = metaTableFor(entityType)
  const own = tx.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1).all()[0]
  if (own !== undefined && own.id !== ownEntityId) {
    throw new SlugOccupiedError(slug, entityType)
  }
  const cross = tx
    .select({ entityType: slugRegistry.entityType })
    .from(slugRegistry)
    .where(eq(slugRegistry.slug, slug))
    .limit(1)
    .all()[0]
  if (cross !== undefined && cross.entityType !== entityType) {
    throw new SlugOccupiedError(slug, cross.entityType as EntityType)
  }
}

function syncPostTagsTx(tx: SqliteTx, postId: number, tagSeeds: readonly { name: string; slug: string }[]): void {
  if (tagSeeds.length > 0) {
    const now = new Date()
    tx.insert(tagTable)
      .values(tagSeeds.map((seed) => ({ name: seed.name, slug: seed.slug, createdAt: now, updatedAt: now })))
      .onConflictDoNothing({ target: tagTable.name })
      .run()
  }
  const names = tagSeeds.map((seed) => seed.name)
  const tagIds =
    names.length > 0
      ? tx
          .select({ id: tagTable.id })
          .from(tagTable)
          .where(inArray(tagTable.name, names))
          .all()
          .map((row) => row.id)
      : []
  tx.delete(postTag).where(eq(postTag.postId, postId)).run()
  if (tagIds.length > 0) {
    tx.insert(postTag)
      .values(tagIds.map((tagId) => ({ postId, tagId })))
      .onConflictDoNothing()
      .run()
  }
}

export interface CreateEntityWithSlugInput {
  entityType: EntityType
  slug: string
  values: NewPostMeta | NewPageMeta
  tagSeeds?: { name: string; slug: string }[]
}

export function createEntityWithSlug(db: Database, input: CreateEntityWithSlugInput): AnyMetaRow {
  return sqliteOf(db).transaction((tx) => {
    reserveSlugTx(tx, input.entityType, input.slug, undefined)
    const table = metaTableFor(input.entityType)
    const inserted = tx
      .insert(table)
      .values(input.values as AnyNewMeta)
      .returning()
      .all()[0]!
    if (input.entityType === 'post') {
      syncPostTagsTx(tx, inserted.id, input.tagSeeds ?? [])
    }
    tx.insert(slugRegistry).values({ slug: input.slug, entityType: input.entityType, entityId: inserted.id }).run()
    return inserted
  })
}

export interface UpdateEntityWithSlugInput {
  entityType: EntityType
  id: number
  slug: string
  slugChanged: boolean
  patch: Partial<NewPostMeta> | Partial<NewPageMeta>
  tagSeeds?: { name: string; slug: string }[]
}

export function updateEntityWithSlug(db: Database, input: UpdateEntityWithSlugInput): AnyMetaRow | null {
  return sqliteOf(db).transaction((tx) => {
    if (input.slugChanged) {
      reserveSlugTx(tx, input.entityType, input.slug, input.id)
    }
    const table = metaTableFor(input.entityType)
    const updated = tx
      .update(table)
      .set({ ...unsafeCast<AnyNewMeta>(input.patch), updatedAt: new Date() })
      .where(eq(table.id, input.id))
      .returning()
      .all()[0]
    if (updated === undefined) {
      return null
    }
    if (input.entityType === 'post') {
      syncPostTagsTx(tx, input.id, input.tagSeeds ?? [])
    }
    if (input.slugChanged) {
      tx.update(slugRegistry)
        .set({ slug: input.slug })
        .where(and(eq(slugRegistry.entityType, input.entityType), eq(slugRegistry.entityId, input.id)))
        .run()
    }
    return updated
  })
}

export function softDeleteEntityWithSlug(db: Database, entityType: EntityType, entityId: number): boolean {
  return sqliteOf(db).transaction((tx) => {
    const table = metaTableFor(entityType)
    const deleted = tx
      .update(table)
      .set(unsafeCast<AnyNewMeta>({ deletedAt: new Date(), updatedAt: new Date() }))
      .where(and(eq(table.id, entityId), isNull(table.deletedAt)))
      .returning({ id: table.id })
      .all()
    if (deleted.length === 0) {
      return false
    }
    if (entityType === 'post') {
      tx.delete(postSearchIndex).where(eq(postSearchIndex.postId, entityId)).run()
    }
    tx.delete(slugRegistry)
      .where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
      .run()
    return true
  })
}

export interface RestoreEntityResult {
  restored: boolean
  meta: AnyMetaRow | null
  slugConflict?: { occupantType: EntityType }
  slugStolen?: boolean
  publishedRevision: ContentRow | null
}

export function restoreEntityReclaimingSlug(
  db: Database,
  entityType: EntityType,
  entityId: number,
): RestoreEntityResult {
  return sqliteOf(db).transaction((tx) => {
    const table = metaTableFor(entityType)
    const restoredRows = tx
      .update(table)
      .set(unsafeCast<AnyNewMeta>({ deletedAt: null, updatedAt: new Date() }))
      .where(eq(table.id, entityId))
      .returning({ id: table.id })
      .all()
    if (restoredRows.length === 0) {
      return { restored: false, meta: null, publishedRevision: null }
    }
    const meta = tx.select().from(table).where(eq(table.id, entityId)).limit(1).all()[0] ?? null
    const result: RestoreEntityResult = { restored: true, meta, publishedRevision: null }
    if (meta !== null) {
      const existing = tx
        .select({ entityType: slugRegistry.entityType, entityId: slugRegistry.entityId })
        .from(slugRegistry)
        .where(eq(slugRegistry.slug, meta.slug))
        .limit(1)
        .all()[0]
      if (existing !== undefined && !(existing.entityType === entityType && existing.entityId === entityId)) {
        result.slugConflict = { occupantType: existing.entityType as EntityType }
      } else {
        try {
          tx.insert(slugRegistry).values({ slug: meta.slug, entityType, entityId }).run()
        } catch (err) {
          if (!isUniqueConstraintError(err, 'slug_registry.slug')) {
            throw err
          }
          result.slugStolen = true
        }
      }
      if (meta.published && meta.publishedRevisionId !== null) {
        result.publishedRevision =
          tx.select().from(contentTable).where(eq(contentTable.id, meta.publishedRevisionId)).limit(1).all()[0] ?? null
      }
    }
    return result
  })
}

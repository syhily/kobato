import type { Database } from '@kobato/db/database'
import type { EntityType } from '@kobato/db/target'
import type { ContentRow, NewPageMeta, NewPostMeta, PageMetaRow, PostMetaRow } from '@kobato/db/types'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/database'
import { isUniqueConstraintError } from '@kobato/db/errors'
import { likeEscape } from '@kobato/db/like-escape'
import { slugRegistry } from '@kobato/db/schema/config'
import { content as contentTable, postSearchIndex } from '@kobato/db/schema/content'
import { page as pageMetaTable } from '@kobato/db/schema/page'
import { post as postMetaTable } from '@kobato/db/schema/post'
import { postTag } from '@kobato/db/schema/post-tag'
import { tag as tagTable } from '@kobato/db/schema/taxonomy'
import { user } from '@kobato/db/schema/user'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, asc, desc, eq, getColumns, inArray, isNotNull, isNull, not, or, sql, type SQL } from 'drizzle-orm'

type AnyNewMeta = NewPostMeta & NewPageMeta
type AnyMetaRow = PostMetaRow | PageMetaRow
type SqliteTx = NodeSQLiteDatabase

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

function metaTableFor(entityType: EntityType) {
  return entityType === 'page' ? pageMetaTable : postMetaTable
}

// ---------------------------------------------------------------------------
// Meta CRUD
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Admin list queries
// ---------------------------------------------------------------------------

export interface EntityListFiltersBase {
  q?: string
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: number
  limit?: number
  offset?: number
}

export interface PostListFilters extends EntityListFiltersBase {
  categoryId?: number
  tag?: string
  visible?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  lifecycle?: 'draft' | 'published'
}

function tagMembershipCondition(tagName: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${postTag}
    INNER JOIN ${tagTable} ON ${eq(postTag.tagId, tagTable.id)}
    WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tagTable.name, tagName)}
  )`
}

function buildBaseListWhere(
  table: typeof postMetaTable | typeof pageMetaTable,
  filters: EntityListFiltersBase,
  extras: SQL[],
): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.deletedStatus === 'deleted') {
    conditions.push(isNotNull(table.deletedAt))
  } else if (filters.deletedStatus === 'normal') {
    conditions.push(isNull(table.deletedAt))
  }
  if (filters.q && filters.q.trim() !== '') {
    const search = or(likeEscape(table.slug, filters.q.trim()), likeEscape(table.title, filters.q.trim()))
    if (search) {
      conditions.push(search)
    }
  }
  if (filters.published !== undefined) {
    conditions.push(eq(table.published, filters.published))
  }
  if (filters.authorId !== undefined) {
    conditions.push(eq(table.authorId, filters.authorId))
  }
  conditions.push(...extras)
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

function buildPostListWhere(filters: PostListFilters): SQL | undefined {
  const extras: SQL[] = []
  if (filters.categoryId !== undefined) {
    extras.push(eq(postMetaTable.categoryId, filters.categoryId))
  }
  if (filters.tag) {
    extras.push(tagMembershipCondition(filters.tag))
  }
  if (filters.visible !== undefined) {
    extras.push(eq(postMetaTable.visible, filters.visible))
  }
  if (filters.lifecycle === 'published') {
    extras.push(promotedEntityWhere(postMetaTable))
  } else if (filters.lifecycle === 'draft') {
    const notPromoted = not(promotedEntityWhere(postMetaTable))
    if (notPromoted) {
      extras.push(notPromoted)
    }
  }
  return buildBaseListWhere(postMetaTable, filters, extras)
}

async function listEntityMetasWhere(
  db: Database,
  table: typeof postMetaTable | typeof pageMetaTable,
  where: SQL | undefined,
  orderBy: SQL,
  filters: EntityListFiltersBase,
): Promise<(AnyMetaRow & { authorName: string | null })[]> {
  const base = sqliteOf(db)
    .select({ ...getColumns(table), authorName: user.name })
    .from(table)
    .leftJoin(user, eq(user.id, table.authorId))
    .orderBy(orderBy)
  const query = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    if (filters.offset !== undefined && filters.offset > 0) {
      return query.limit(filters.limit).offset(filters.offset)
    }
    return query.limit(filters.limit)
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    return query.offset(filters.offset)
  }
  return query
}

async function countEntityMetasWhere(
  db: Database,
  table: typeof postMetaTable | typeof pageMetaTable,
  where: SQL | undefined,
): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(where)
  return rows[0]?.count ?? 0
}

export async function listPostMetas(
  db: Database,
  filters: PostListFilters,
): Promise<(PostMetaRow & { authorName: string | null })[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const orderBy = filters.sortOrder === 'asc' ? asc(col) : desc(col)
  return unsafeCast<(PostMetaRow & { authorName: string | null })[]>(
    await listEntityMetasWhere(db, postMetaTable, buildPostListWhere(filters), orderBy, filters),
  )
}

export async function countPostMetas(db: Database, filters: PostListFilters): Promise<number> {
  return countEntityMetasWhere(db, postMetaTable, buildPostListWhere(filters))
}

export async function listPageMetas(
  db: Database,
  filters: EntityListFiltersBase,
): Promise<(PageMetaRow & { authorName: string | null })[]> {
  return unsafeCast<(PageMetaRow & { authorName: string | null })[]>(
    await listEntityMetasWhere(
      db,
      pageMetaTable,
      buildBaseListWhere(pageMetaTable, filters, []),
      desc(pageMetaTable.updatedAt),
      filters,
    ),
  )
}

export async function countPageMetas(db: Database, filters: EntityListFiltersBase): Promise<number> {
  return countEntityMetasWhere(db, pageMetaTable, buildBaseListWhere(pageMetaTable, filters, []))
}

// ---------------------------------------------------------------------------
// Mutation transaction scripts (slug reservation + meta + relations + registry)
// ---------------------------------------------------------------------------

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

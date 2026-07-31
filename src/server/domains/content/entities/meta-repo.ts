import { and, desc, eq, getColumns, isNotNull, isNull, or, sql, type Column, type SQL } from 'drizzle-orm'

import type { MetaCrud, MetaRowBase } from '@/server/domains/content/entities/descriptor'
import type { LimitOffset } from '@/server/domains/content/pagination'
import type { Database } from '@/server/infra/db/database'
import type { page as pageMetaTable } from '@/server/infra/db/schema/page'
import type { post as postMetaTable } from '@/server/infra/db/schema/post'
import type { NewPageMeta, NewPostMeta } from '@/server/infra/db/types'

import { applyLimitOffset } from '@/server/domains/content/pagination'
import { likeEscape } from '@/server/infra/db/like-escape'
import { user } from '@/server/infra/db/schema/user'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * The two meta tables. Type-only union (like `LiveContentColumns` in
 * `content/schemas/live-gate.ts`) — the generic queries below bind the shared
 * columns structurally and never touch entity extras.
 */
export type MetaTable = typeof postMetaTable | typeof pageMetaTable

type AnyNewMeta = NewPostMeta | NewPageMeta

/**
 * The meta-table CRUD every content entity shares: id/slug lookups
 * (including the row-locking reservation probe and the public
 * not-deleted slug read), insert, patch-by-id, soft-delete / restore.
 * One implementation over the shared columns; the entity's table comes
 * in as a parameter so no entity fork can drift. Rows cross the
 * boundary as `unknown` and leave as `TMeta` (`MetaRowBase`).
 */
export function makeMetaCrud<TMeta extends MetaRowBase, TNew extends AnyNewMeta>(
  table: MetaTable,
): MetaCrud<TMeta, TNew> {
  return {
    findMetaById(db, id) {
      const rows: unknown[] = db.select().from(table).where(eq(table.id, id)).limit(1).all()
      return unsafeCast<TMeta | null>(rows[0] ?? null)
    },

    findMetaBySlug(db, slug) {
      const rows: unknown[] = db.select().from(table).where(eq(table.slug, slug)).limit(1).all()
      return unsafeCast<TMeta | null>(rows[0] ?? null)
    },

    findMetaBySlugForUpdate(db, slug) {
      // Identical SQL to `findMetaBySlug` — the "ForUpdate" name is a
      // PG-era fossil (`SELECT … FOR UPDATE` had no SQLite mapping to
      // emit). The lock it promises is still real, just inherited:
      // node:sqlite serializes writers on one connection, so a read
      // inside a `db.transaction` cannot interleave with another write.
      // The separate name survives so call sites state their intent —
      // "I am about to mutate this row" — and the reservation probe
      // stays greppable.
      const rows: unknown[] = db.select().from(table).where(eq(table.slug, slug)).limit(1).all()
      return unsafeCast<TMeta | null>(rows[0] ?? null)
    },

    findPublicMetaBySlug(db, slug) {
      const rows: unknown[] = db
        .select()
        .from(table)
        .where(and(eq(table.slug, slug), isNull(table.deletedAt)))
        .limit(1)
        .all()
      return unsafeCast<TMeta | null>(rows[0] ?? null)
    },

    insertMeta(db, values) {
      const rows: unknown[] = db.insert(table).values(values).returning().all()
      return unsafeCast<TMeta>(rows[0])
    },

    updateMetaById(db, id, patch) {
      const rows: unknown[] = db
        .update(table)
        .set(unsafeCast<AnyNewMeta>({ ...patch, updatedAt: new Date() }))
        .where(eq(table.id, id))
        .returning()
        .all()
      return unsafeCast<TMeta | null>(rows[0] ?? null)
    },

    softDeleteMeta(db, id) {
      const now = new Date()
      const rows = db
        .update(table)
        .set(unsafeCast<AnyNewMeta>({ deletedAt: now, updatedAt: now }))
        .where(and(eq(table.id, id), isNull(table.deletedAt)))
        .returning({ id: table.id })
        .all()
      return rows.length > 0
    },

    restoreMeta(db, id) {
      const rows = db
        .update(table)
        .set(unsafeCast<AnyNewMeta>({ deletedAt: null, updatedAt: new Date() }))
        .where(eq(table.id, id))
        .returning({ id: table.id })
        .all()
      return rows.length > 0
    },
  }
}

/** The list filters both entities share (posts add taxonomy/visible/lifecycle legs as `extras`). */
export interface MetaListFiltersBase extends LimitOffset {
  /** Free-text query matched case-insensitively against `slug` and `title`. */
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
  /** Filter by published flag. */
  published?: boolean
  /** Filter by author id. */
  authorId?: number
}

/**
 * The shared legs of the admin-list WHERE clause (deletion state,
 * slug/title search, published flag, author) plus entity `extras`.
 * SQL `AND` is order-insensitive, so posts keep their taxonomy legs in
 * `extras` without changing query semantics.
 */
export function buildMetaListWhere(
  table: MetaTable,
  filters: MetaListFiltersBase,
  extras: SQL[] = [],
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

export interface MetaListQueriesOptions<TFilters extends LimitOffset> {
  buildWhere: (filters: TFilters) => SQL | undefined
  orderBy: (filters: TFilters) => SQL
}

export interface MetaListQueries<TMeta extends MetaRowBase, TFilters extends LimitOffset> {
  listMetas: (db: Database, filters: TFilters) => Promise<(TMeta & { authorName: string | null })[]>
  countMetas: (db: Database, filters: TFilters) => Promise<number>
}

/**
 * The admin-list meta queries both entities share: meta columns joined
 * with the author's name, filtered + ordered + paginated per entity
 * options, plus the matching count.
 */
export function makeMetaListQueries<TMeta extends MetaRowBase, TFilters extends LimitOffset>(
  table: MetaTable,
  options: MetaListQueriesOptions<TFilters>,
): MetaListQueries<TMeta, TFilters> {
  return {
    async listMetas(db, filters) {
      const where = options.buildWhere(filters)
      const base = db
        .select({ ...unsafeCast<Record<string, Column>>(getColumns(table)), authorName: user.name })
        .from(table)
        .leftJoin(user, eq(user.id, table.authorId))
        .orderBy(options.orderBy(filters))
      const q = where ? base.where(where) : base
      const rows: unknown[] = await applyLimitOffset(q, filters)
      return unsafeCast<(TMeta & { authorName: string | null })[]>(rows)
    },

    async countMetas(db, filters) {
      const where = options.buildWhere(filters)
      const builder = where
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(table)
            .where(where)
        : db.select({ count: sql<number>`count(*)` }).from(table)
      const rows = await builder
      return rows[0]?.count ?? 0
    },
  }
}

/** Shared `updatedAt DESC` admin-list ordering (pages). */
export function orderByUpdatedAtDesc(table: MetaTable): SQL {
  return desc(table.updatedAt)
}

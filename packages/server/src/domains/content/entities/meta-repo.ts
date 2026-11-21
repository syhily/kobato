import type { Database } from '@kobato/db/database'
import type { page as pageMetaTable } from '@kobato/db/schema/page'
import type { post as postMetaTable } from '@kobato/db/schema/post'
import type { NewPageMeta, NewPostMeta } from '@kobato/db/types'
import type { MetaCrud, MetaRowBase } from '@kobato/server/domains/content/entities/descriptor'
import type { LimitOffset } from '@kobato/server/domains/content/pagination'

import { likeEscape } from '@kobato/db/like-escape'
import { user } from '@kobato/db/schema/user'
import { applyLimitOffset } from '@kobato/server/domains/content/pagination'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, eq, getColumns, isNotNull, isNull, or, sql, type Column, type SQL } from 'drizzle-orm'

export type MetaTable = typeof postMetaTable | typeof pageMetaTable

type AnyNewMeta = NewPostMeta | NewPageMeta

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

export interface MetaListFiltersBase extends LimitOffset {
  q?: string
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: number
}

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

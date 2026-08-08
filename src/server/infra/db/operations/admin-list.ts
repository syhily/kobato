import type { SelectedFields, SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import { and, eq, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { user } from '@/server/infra/db/schema/user'

/**
 * Shared query shapes for the admin list endpoints: WHERE assembly, the
 * pagination tail, and the `<entity> LEFT JOIN user` uploader projection,
 * so the near-identical list implementations cannot drift apart.
 */

/**
 * Collapse conditions into one `WHERE` fragment — `undefined` when empty —
 * so the row listing and its counter share the same predicate.
 */
export function assembleWhere(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

export interface AdminListPage {
  /** Zero-based offset. Values `<= 0` are ignored (same as omitting). */
  offset?: number
  /** Page size. When undefined, all matching rows are returned. */
  limit?: number
}

type PageableQuery<TRow> = PromiseLike<TRow[]> & {
  limit(count: number): PromiseLike<TRow[]> & { offset(count: number): PromiseLike<TRow[]> }
  offset(count: number): PromiseLike<TRow[]>
}

/** Apply the pagination tail; `offset` is only honored when strictly positive. */
export function applyPage<TRow>(query: PageableQuery<TRow>, page: AdminListPage): Promise<TRow[]> {
  if (page.limit !== undefined) {
    if (page.offset !== undefined && page.offset > 0) {
      return Promise.resolve(query.limit(page.limit).offset(page.offset))
    }
    return Promise.resolve(query.limit(page.limit))
  }
  if (page.offset !== undefined && page.offset > 0) {
    return Promise.resolve(query.offset(page.offset))
  }
  return Promise.resolve(query)
}

/**
 * Projection adapter for the `<entity> LEFT JOIN user` pattern: entity
 * columns verbatim (never `select(*)`, so `user.password` stays out),
 * plus `uploaderName`; owns the by-id refetch and the update-then-refetch.
 */
export function withUploader<TColumns extends SelectedFields>(options: {
  table: SQLiteTable
  idColumn: SQLiteColumn
  uploaderIdColumn: SQLiteColumn
  /** Entity-specific column selection, WITHOUT `uploaderName`. */
  columns: TColumns
}) {
  const columns = { ...options.columns, uploaderName: user.name } as const

  function selectJoined(db: Database) {
    return db.select(columns).from(options.table).leftJoin(user, eq(user.id, options.uploaderIdColumn))
  }

  async function findJoinedRowById(db: Database, id: number) {
    const rows = await selectJoined(db).where(eq(options.idColumn, id)).limit(1)
    return rows[0] ?? null
  }

  /** Update, then re-read through the joined projection so the caller gets the full DTO in one call. */
  async function updateThenRefetch<TUpdated>(
    db: Database,
    id: number,
    update: (db: Database, id: number) => Promise<TUpdated | null>,
  ) {
    const updated = await update(db, id)
    if (updated === null) {
      return null
    }
    return findJoinedRowById(db, id)
  }

  return { columns, selectJoined, findJoinedRowById, updateThenRefetch }
}

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgColumn, PgTable, SelectedFields } from 'drizzle-orm/pg-core'

import { and, eq, type SQL } from 'drizzle-orm'

import { user } from '@/server/infra/db/schema/user'

/**
 * Shared query shapes for the admin list endpoints. The entity
 * operation modules (`image`, `music`, `friend`, `category`, …) keep
 * only their entity-specific filter→SQL mapping and column
 * selections; the WHERE assembly, the offset/limit pagination tail,
 * and the `<entity> LEFT JOIN user` uploader projection live here so
 * the four near-identical implementations cannot drift apart.
 */

/**
 * Collapse a conditions array into a single `WHERE` fragment:
 * `undefined` when empty (caller skips `.where()` entirely), the
 * single condition verbatim, or the conjunction otherwise. Centralised
 * so the row listing and its pagination counter always filter on the
 * same predicate shape.
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

/**
 * Structural minimum `applyPage` needs from a Drizzle select: an
 * awaitable row list whose `limit`/`offset` tails stay awaitable.
 */
type PageableQuery<TRow> = PromiseLike<TRow[]> & {
  limit(count: number): PromiseLike<TRow[]> & { offset(count: number): PromiseLike<TRow[]> }
  offset(count: number): PromiseLike<TRow[]>
}

/**
 * Apply the admin list pagination tail to an ordered select. `limit`
 * is the primary control; `offset` is only honoured when strictly
 * positive (a zero/negative offset must not emit `OFFSET 0`… or drop
 * the `LIMIT` branch). Passing neither returns the query untouched.
 */
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
 * Projection adapter for the `<entity> LEFT JOIN user` pattern the
 * admin list views share: the entity's own columns (projected
 * verbatim, so `user.password` never leaks into a `select(*)`), plus
 * an `uploaderName` joined from `user`. The LEFT JOIN keeps rows
 * visible when `uploader_id` is NULL (legacy rows) or the uploader
 * was hard-deleted; `uploaderName` is `null` in both cases.
 *
 * Also owns the two consumers of that projection: the single-row
 * refetch by id, and the UPDATE…RETURNING two-step — PG's
 * `UPDATE ... RETURNING` cannot `JOIN`, so a mutation that must hand
 * the admin shell the full joined DTO updates first and re-reads the
 * row through the same projection.
 */
export function withUploader<TColumns extends SelectedFields>(options: {
  /** Entity table the projection selects from. */
  table: PgTable
  /** The table's primary-key column, matched by `findJoinedRowById`. */
  idColumn: PgColumn
  /** The table's FK column the `user` join hangs off. */
  uploaderIdColumn: PgColumn
  /** Entity-specific column selection, WITHOUT `uploaderName`. */
  columns: TColumns
}) {
  const columns = { ...options.columns, uploaderName: user.name } as const

  /** Base `<entity> LEFT JOIN user` select; callers chain `.where()` / `.orderBy()` as needed. */
  function selectJoined(db: NodePgDatabase) {
    return db.select(columns).from(options.table).leftJoin(user, eq(user.id, options.uploaderIdColumn))
  }

  /** Single-row read through the joined projection, keyed by `idColumn`. */
  async function findJoinedRowById(db: NodePgDatabase, id: bigint) {
    const rows = await selectJoined(db).where(eq(options.idColumn, id)).limit(1)
    return rows[0] ?? null
  }

  /**
   * Run an entity update, then re-read the row through the joined
   * projection so the caller receives the full DTO (including
   * `uploaderName`) in one helper call. Returns `null` without a
   * follow-up read when the update matched no row.
   */
  async function updateThenRefetch<TUpdated>(
    db: NodePgDatabase,
    id: bigint,
    update: (db: NodePgDatabase, id: bigint) => Promise<TUpdated | null>,
  ) {
    const updated = await update(db, id)
    if (updated === null) {
      return null
    }
    return findJoinedRowById(db, id)
  }

  return { columns, selectJoined, findJoinedRowById, updateThenRefetch }
}

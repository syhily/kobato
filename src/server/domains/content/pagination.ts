export interface LimitOffset {
  limit?: number
  offset?: number
}

/**
 * Minimal structural view of a drizzle select builder that can still be
 * paginated. Typed structurally (not via `AnyPgSelectQueryBuilder`)
 * because a conditional `.where()` upstream retypes the builder as an
 * `Omit<>` of the class, which no longer satisfies the class constraint.
 */
interface Paginatable<Row> extends PromiseLike<Row[]> {
  limit(limit: number): PromiseLike<Row[]> & { offset(offset: number): PromiseLike<Row[]> }
  offset(offset: number): PromiseLike<Row[]>
}

/**
 * Shared limit/offset ladder for admin list queries. A conditional
 * `.limit()` / `.offset()` can't be expressed as one fluent expression on
 * drizzle's non-dynamic builder (each method retypes the query via
 * `PgSelectWithout`), so every admin list repo used to hand-copy this
 * four-branch ladder.
 */
export function applyLimitOffset<Row>(query: Paginatable<Row>, { limit, offset }: LimitOffset): PromiseLike<Row[]> {
  if (limit !== undefined) {
    if (offset !== undefined && offset > 0) {
      return query.limit(limit).offset(offset)
    }
    return query.limit(limit)
  }
  if (offset !== undefined && offset > 0) {
    return query.offset(offset)
  }
  return query
}

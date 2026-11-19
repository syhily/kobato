export interface LimitOffset {
  limit?: number
  offset?: number
}

interface Paginatable<Row> extends PromiseLike<Row[]> {
  limit(limit: number): PromiseLike<Row[]> & { offset(offset: number): PromiseLike<Row[]> }
  offset(offset: number): PromiseLike<Row[]>
}

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

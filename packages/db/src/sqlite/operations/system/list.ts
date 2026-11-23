import { and, type SQL } from 'drizzle-orm'

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
  offset?: number
  limit?: number
}

type PageableQuery<TRow> = PromiseLike<TRow[]> & {
  limit(count: number): PromiseLike<TRow[]> & { offset(count: number): PromiseLike<TRow[]> }
  offset(count: number): PromiseLike<TRow[]>
}

export function applyPage<TRow>(query: PageableQuery<TRow>, page: AdminListPage): Promise<TRow[]> {
  if (page.limit !== undefined && page.limit > 0) {
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

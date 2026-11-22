import type { AdminPageDetailDto, AdminPageDto } from '@kobato/api/contracts/pages'
import type { Database } from '@kobato/db/database'

import {
  countPageMetas as countPageMetasOp,
  type EntityListFiltersBase,
  listPageMetas as listPageMetasOp,
} from '@kobato/db/operations/entity-meta'
import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor'

export type ListPagesFilters = EntityListFiltersBase

export const listPageMetas = listPageMetasOp
export const countPageMetas = countPageMetasOp

export interface AdminPagesListResult {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

const adminQuery = makeEntityAdminQuery(pageDescriptor, {
  listMetas: listPageMetas,
  countMetas: countPageMetas,
})

export async function listPagesForAdmin(db: Database, filters: ListPagesFilters = {}): Promise<AdminPagesListResult> {
  const { items, total, hasMore } = await adminQuery.listForAdmin(db, filters)
  return { pages: items, total, hasMore }
}

export async function getPageDetailForAdmin(db: Database, id: number): Promise<AdminPageDetailDto> {
  const { meta, latestRevision, publishedRevision } = await adminQuery.getDetailForAdmin(db, id)
  return { page: meta, latestRevision, publishedRevision }
}

export const listRevisionsForAdmin = adminQuery.listRevisionsForAdmin

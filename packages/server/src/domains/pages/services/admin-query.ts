import type { AdminPageDetailDto, AdminPageDto } from '@kobato/server/domains/pages/projection'
import type { ListPagesFilters } from '@kobato/server/domains/pages/repo'
import type { Database } from '@kobato/server/infra/db/database'

import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor'
import { countPageMetas, listPageMetas } from '@kobato/server/domains/pages/repo'

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

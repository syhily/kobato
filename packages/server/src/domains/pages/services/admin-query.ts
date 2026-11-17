import type { AdminPageDetailDto, AdminPageDto } from '@kobato/contracts/pages.ts'
import type { Database } from '@kobato/db/database.ts'
import type { ListPagesFilters } from '@kobato/server/domains/pages/repo.ts'

import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query.ts'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor.ts'
import { countPageMetas, listPageMetas } from '@kobato/server/domains/pages/repo.ts'

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

import type { ListPagesFilters } from '@/server/domains/pages/repo'
import type { Database } from '@/server/infra/db/database'
import type { AdminPageDetailDto, AdminPageDto } from '@/shared/contracts/pages'

import { makeEntityAdminQuery } from '@/server/domains/content/entities/admin-query'
import { pageDescriptor } from '@/server/domains/pages/descriptor'
import { countPageMetas, listPageMetas } from '@/server/domains/pages/repo'

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

import type { AdminPageDetailDto, AdminPageDto } from '@kobato/shared/contracts/pages.ts'

import type { Database } from '../../../infra/db/database'
import type { ListPagesFilters } from '../repo'

import { makeEntityAdminQuery } from '../../content/entities/admin-query'
import { pageDescriptor } from '../descriptor'
import { countPageMetas, listPageMetas } from '../repo'

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

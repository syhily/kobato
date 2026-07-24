import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminPageDetailDto, AdminPageDto } from '@/server/domains/pages/projection'
import type { AdminRevisionDto } from '@/shared/contracts/revision'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { findContentById, findLatestRevision, listRevisions } from '@/server/domains/content/repos/query'
import { listForAdmin } from '@/server/domains/content/services/admin-list'
import { toAdminPageDto } from '@/server/domains/pages/projection'
import { countPageMetas, findPageMetaById, listPageMetas, type ListPagesFilters } from '@/server/domains/pages/repo'
import { DomainError } from '@/server/infra/http/errors'

export interface AdminPagesListResult {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

export async function listPagesForAdmin(
  db: NodePgDatabase,
  filters: ListPagesFilters = {},
): Promise<AdminPagesListResult> {
  const { items, total, hasMore } = await listForAdmin(db, {
    entityType: 'page',
    filters,
    defaultLimit: 100,
    listRows: listPageMetas,
    countRows: countPageMetas,
    toDto: (row, engagement) => toAdminPageDto(row, engagement),
  })
  return { pages: items, total, hasMore }
}

export async function getPageDetailForAdmin(db: NodePgDatabase, id: bigint): Promise<AdminPageDetailDto> {
  const meta = await findPageMetaById(db, id)
  if (meta === null) {
    // Same service-throws contract as posts' getPostDetailForAdmin: the
    // `domainErrorGuard` middleware translates this to ORPC NOT_FOUND,
    // so the controller has no null branch.
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const [latest, published] = await Promise.all([
    findLatestRevision(db, 'page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
  ])
  return {
    page: toAdminPageDto(meta),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(db: NodePgDatabase, id: bigint): Promise<AdminRevisionDto[]> {
  const rows = await listRevisions(db, 'page', id)
  return rows.map(toAdminRevisionDto)
}

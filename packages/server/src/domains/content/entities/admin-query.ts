import type { AdminRevisionDto } from '@kobato/contracts/revision.ts'
import type { Database } from '@kobato/db/database.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'
import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@kobato/server/domains/content/entities/descriptor.ts'
import type { MetaListQueries } from '@kobato/server/domains/content/entities/meta-repo.ts'
import type { LimitOffset } from '@kobato/server/domains/content/pagination.ts'
import type { AdminListEngagement, AdminListResult } from '@kobato/server/domains/content/services/admin-list.ts'

import { toAdminRevisionDto } from '@kobato/server/domains/content/projection.ts'
import { findContentById, findLatestRevision, listRevisions } from '@kobato/server/domains/content/revisions.ts'
import { listForAdmin } from '@kobato/server/domains/content/services/admin-list.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

export interface EntityAdminDetail<TAdminDto> {
  meta: TAdminDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

export interface EntityAdminQuery<TFilters extends LimitOffset, TAdminDto> {
  listForAdmin: (db: Database, filters: TFilters, viewer?: ViewerIdentity) => Promise<AdminListResult<TAdminDto>>
  getDetailForAdmin: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<EntityAdminDetail<TAdminDto>>
  listRevisionsForAdmin: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<AdminRevisionDto[]>
}

export function makeEntityAdminQuery<
  TMeta extends MetaRowBase,
  TNew,
  TInput extends UpsertMetaInputBase,
  TExtras extends object,
  TAdminDto,
  TRestore,
  TFilters extends LimitOffset,
>(
  descriptor: MetaEntityDescriptor<TMeta, TNew, TInput, TExtras, TAdminDto, unknown, TRestore>,
  queries: MetaListQueries<TMeta, TFilters>,
): EntityAdminQuery<TFilters, TAdminDto> {
  const { repos } = descriptor

  async function listForAdminScoped(db: Database, filters: TFilters, viewer?: ViewerIdentity) {
    const applied = viewer !== undefined ? (descriptor.access.scopeListFilters?.(filters, viewer) ?? filters) : filters
    return listForAdmin(db, {
      entityType: descriptor.entityType,
      filters: applied,
      defaultLimit: descriptor.defaultAdminListLimit,
      listRows: queries.listMetas,
      countRows: queries.countMetas,
      loadExtras: descriptor.adminDto.loadListExtras,
      toDto: (row, engagement, extras) =>
        descriptor.adminDto.project(
          row,
          unsafeCast<Partial<AdminListEngagement> & Partial<TExtras>>({ ...engagement, ...extras }),
        ),
    })
  }

  async function getDetailForAdmin(db: Database, id: number, viewer?: ViewerIdentity) {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const [latest, published, extras] = await Promise.all([
      findLatestRevision(db, descriptor.entityType, meta.id),
      meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
      descriptor.adminDto.loadDetailExtras?.(db, meta) ?? Promise.resolve(undefined),
    ])
    return {
      meta: descriptor.adminDto.project(meta, extras),
      latestRevision: latest === null ? null : toAdminRevisionDto(latest),
      publishedRevision: published === null ? null : toAdminRevisionDto(published),
    }
  }

  async function listRevisionsForAdmin(db: Database, id: number, viewer?: ViewerIdentity) {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const rows = await listRevisions(db, descriptor.entityType, id)
    return rows.map(toAdminRevisionDto)
  }

  return { listForAdmin: listForAdminScoped, getDetailForAdmin, listRevisionsForAdmin }
}

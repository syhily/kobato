import type { AdminRevisionDto } from '@kobato/shared/contracts/revision.ts'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'

import type { Database } from '../../../infra/db/database'
import type { ViewerIdentity } from '../../auth/rbac'
import type { LimitOffset } from '../pagination'
import type { AdminListEngagement, AdminListResult } from '../services/admin-list'
import type { MetaEntityDescriptor, MetaRowBase, UpsertMetaInputBase } from './descriptor'
import type { MetaListQueries } from './meta-repo'

import { toAdminRevisionDto } from '../projection'
import { findContentById, findLatestRevision, listRevisions } from '../revisions'
import { listForAdmin } from '../services/admin-list'

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

/** Admin-query trio every content entity shares; all gated through `assertAccess`, so a missing entity is NOT_FOUND. */
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
          // Both partials are plain DTO option bags; the spread keeps every key optional.
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

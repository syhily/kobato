import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@/server/domains/content/entities/descriptor'
import type { MetaListQueries } from '@/server/domains/content/entities/meta-repo'
import type { LimitOffset } from '@/server/domains/content/pagination'
import type { AdminListEngagement, AdminListResult } from '@/server/domains/content/services/admin-list'
import type { AdminRevisionDto } from '@/shared/contracts/revision'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { findContentById, findLatestRevision, listRevisions } from '@/server/domains/content/revisions'
import { listForAdmin } from '@/server/domains/content/services/admin-list'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface EntityAdminDetail<TAdminDto> {
  meta: TAdminDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

export interface EntityAdminQuery<TFilters extends LimitOffset, TAdminDto> {
  listForAdmin: (db: NodePgDatabase, filters: TFilters, viewer?: ViewerIdentity) => Promise<AdminListResult<TAdminDto>>
  getDetailForAdmin: (db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) => Promise<EntityAdminDetail<TAdminDto>>
  listRevisionsForAdmin: (db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) => Promise<AdminRevisionDto[]>
}

/**
 * The admin-query trio every content entity shares: `listForAdmin`
 * (viewer-scoped filters, engagement + extras fan-out), the detail read
 * (meta + latest/published revision + extras), and the revision list.
 * All three gate through the descriptor's `assertAccess`, so a missing
 * entity surfaces the entity's NOT_FOUND.
 */
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

  async function listForAdminScoped(db: NodePgDatabase, filters: TFilters, viewer?: ViewerIdentity) {
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

  async function getDetailForAdmin(db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) {
    const meta = await repos.findMetaById(db, id)
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

  async function listRevisionsForAdmin(db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) {
    const meta = await repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const rows = await listRevisions(db, descriptor.entityType, id)
    return rows.map(toAdminRevisionDto)
  }

  return { listForAdmin: listForAdminScoped, getDetailForAdmin, listRevisionsForAdmin }
}

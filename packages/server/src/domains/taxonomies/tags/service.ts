import type { AdminTagDto } from '@kobato/api/contracts/admin/tags'
import type { Tag } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { TagRow } from '@kobato/db/sqlite/types'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { hasAtLeast } from '@kobato/base/auth/roles'
import {
  type AdminTagsListFilters,
  countAdminTags,
  deleteTag as deleteTagRow,
  findTagBySlug as findTagBySlugOp,
  findTagNameSlugByNames,
  findTagById,
  findTagByName,
  insertTag,
  listAdminTagRows,
  listTagNameSlugRows,
  updateTag,
} from '@kobato/db/sqlite/operations/taxonomy/tag'
import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { countPostsByTaxonomy, listPostTitlesByTaxonomy } from '@kobato/server/domains/posts/services/taxonomy'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
  taxonomyNotFound,
} from '@kobato/server/domains/taxonomies/shared'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { resolveSlug } from '@kobato/server/infra/slug/resolve'

export function toAdminTagDto(row: TagRow, postCount: number): AdminTagDto {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    ogImage: row.ogImage,
    postCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface AdminTagsListResult {
  tags: AdminTagDto[]
  total: number
  hasMore: boolean
}

export async function listTagsForAdmin(db: Database, filters: AdminTagsListFilters): Promise<AdminTagsListResult> {
  const offset = filters.offset ?? 0
  const [rows, total, counts] = await Promise.all([
    listAdminTagRows(db, filters),
    countAdminTags(db, { q: filters.q }),
    countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin' }),
  ])
  return {
    tags: rows.map((row) => toAdminTagDto(row, counts.get(row.name) ?? 0)),
    total,
    hasMore: offset + rows.length < total,
  }
}

export interface UpsertTagInputs {
  id?: number
  name: string
  slug?: string
  ogImage?: string
}

export async function upsertAdminTag(
  db: Database,
  input: UpsertTagInputs,
  viewer?: ViewerIdentity,
): Promise<AdminTagDto> {
  const slug = resolveSlug(input.slug, input.name, { entity: 'taxonomy' })

  if (input.id === undefined) {
    await ensureUniqueOnCreateTaxonomy(
      (name) => findTagByName(db, name),
      (slug) => findTagBySlug(db, slug),
      input.name,
      slug,
      'tag',
    )
    const row = await insertTag(db, { name: input.name, slug, ogImage: input.ogImage ?? '' })
    invalidateContent({ entity: 'tag' })
    const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin', name: row.name })
    return toAdminTagDto(row, counts.get(row.name) ?? 0)
  }

  if (viewer && !hasAtLeast(viewer.role, 'admin')) {
    throw new DomainError('FORBIDDEN', ErrorMessages.FORBIDDEN)
  }

  const existing = await findTagById(db, input.id)
  if (existing === null) {
    throw taxonomyNotFound('tag')
  }
  await ensureUniqueOnUpdateTaxonomy(
    (name) => findTagByName(db, name),
    (slug) => findTagBySlug(db, slug),
    input.id,
    input.name,
    existing.name,
    slug,
    existing.slug,
    'tag',
  )
  const updated = await updateTag(db, input.id, { name: input.name, slug, ogImage: input.ogImage })
  if (updated === null) {
    throw taxonomyNotFound('tag')
  }
  invalidateContent({ entity: 'tag' })
  const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin', name: updated.name })
  return toAdminTagDto(updated, counts.get(updated.name) ?? 0)
}

export async function deleteAdminTag(db: Database, id: number, _viewer?: ViewerIdentity): Promise<boolean> {
  const deleted = await deleteAdminTaxonomy(id, 'tag', {
    findById: (id) => findTagById(db, id),
    deleteRow: (id) => deleteTagRow(db, id),
    listPostTitles: (row) => listPostTitlesByTaxonomy(db, row.name),
  })
  if (deleted) {
    invalidateContent({ entity: 'tag' })
  }
  return deleted
}

export async function findTagBySlug(db: Database, slug: string): Promise<TagRow | null> {
  return findTagBySlugOp(db, slug)
}

export async function listAllTags(db: Database): Promise<Tag[]> {
  const tagRows = await listTagNameSlugRows(db)

  if (tagRows.length === 0) {
    return []
  }

  const countsMap = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'public' })

  return tagRows.map((row) => ({
    name: row.name,
    slug: row.slug,
    counts: countsMap.get(row.name) ?? 0,
    permalink: `/tags/${row.slug}`,
  }))
}

export async function getTagsByNames(db: Database, names: readonly string[]): Promise<Tag[]> {
  if (names.length === 0) {
    return []
  }
  const uniqueNames = [...new Set(names)]

  const [tagRows, countsMap] = await Promise.all([
    findTagNameSlugByNames(db, uniqueNames),
    countPostsByTaxonomy(db, { kind: 'tag', gate: 'public', names: uniqueNames }),
  ])

  if (tagRows.length === 0) {
    return []
  }

  const tagMap = new Map(
    tagRows.map((r) => [
      r.name,
      {
        name: r.name,
        slug: r.slug,
        counts: countsMap.get(r.name) ?? 0,
        permalink: `/tags/${r.slug}`,
      } as Tag,
    ]),
  )

  return uniqueNames.map((name) => tagMap.get(name)).filter((t): t is Tag => t !== undefined)
}

export async function resolveTagBySlugOrName(db: Database, value: string): Promise<TagRow | null> {
  return (await findTagBySlug(db, value)) ?? (await findTagByName(db, value))
}

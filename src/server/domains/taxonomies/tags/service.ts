import { asc, eq, inArray } from 'drizzle-orm'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'
import type { TagRow } from '@/server/infra/db/types'
import type { AdminTagDto } from '@/shared/contracts/tags'
import type { Tag } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { countPostsByTaxonomy, listPostTitlesByTaxonomy } from '@/server/domains/posts/services/taxonomy'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
} from '@/server/domains/taxonomies/shared'
import { through } from '@/server/infra/cache/registry'
import {
  type AdminTagsListFilters,
  countAdminTags,
  deleteTag as deleteTagRow,
  findTagById,
  findTagByName,
  insertTag,
  listAdminTagRows,
  updateTag,
} from '@/server/infra/db/operations/tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { resolveSlug } from '@/server/infra/slug/resolve'
import { hasAtLeast } from '@/shared/utils/roles'

// Wire-format DTO; `postCount` is projected by the caller (like categories).
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

// `total` is the full filtered count, independent of offset/limit.
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
      '标签',
    )
    const row = await insertTag(db, { name: input.name, slug, ogImage: input.ogImage ?? '' })
    invalidateContent(db, { entity: 'tag' })
    const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin', name: row.name })
    return toAdminTagDto(row, counts.get(row.name) ?? 0)
  }

  // Authors may only create tags; renaming is admin-only.
  if (viewer && !hasAtLeast(viewer.role, 'admin')) {
    throw new DomainError('FORBIDDEN', ErrorMessages.FORBIDDEN)
  }

  const existing = await findTagById(db, input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '标签不存在')
  }
  await ensureUniqueOnUpdateTaxonomy(
    (name) => findTagByName(db, name),
    (slug) => findTagBySlug(db, slug),
    input.id,
    input.name,
    existing.name,
    slug,
    existing.slug,
    '标签',
  )
  const updated = await updateTag(db, input.id, { name: input.name, slug, ogImage: input.ogImage })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '标签不存在')
  }
  invalidateContent(db, { entity: 'tag' })
  const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin', name: updated.name })
  return toAdminTagDto(updated, counts.get(updated.name) ?? 0)
}

// Block-only deletion for every role — a stricter-than-RBAC fence so posts are never orphaned.
export async function deleteAdminTag(db: Database, id: number, _viewer?: ViewerIdentity): Promise<boolean> {
  const deleted = await deleteAdminTaxonomy(id, '标签', {
    findById: (id) => findTagById(db, id),
    deleteRow: (id) => deleteTagRow(db, id),
    listPostTitles: (row) => listPostTitlesByTaxonomy(db, 'tag', row.name),
  })
  if (deleted) {
    invalidateContent(db, { entity: 'tag' })
  }
  return deleted
}

// Public routes resolve strictly by slug.
export async function findTagBySlug(db: Database, slug: string): Promise<TagRow | null> {
  const rows = await db.select().from(tagTable).where(eq(tagTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function listAllTags(db: Database): Promise<Tag[]> {
  return through(db, 'tags', {}, async () => {
    const tagRows = await db
      .select({ name: tagTable.name, slug: tagTable.slug })
      .from(tagTable)
      .orderBy(asc(tagTable.name))

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
  })
}

export async function getTagsByNames(db: Database, names: readonly string[]): Promise<Tag[]> {
  if (names.length === 0) {
    return []
  }
  const uniqueNames = [...new Set(names)]

  const tagRowsPromise = db
    .select({ name: tagTable.name, slug: tagTable.slug })
    .from(tagTable)
    .where(inArray(tagTable.name, uniqueNames))
  // Narrow the count to the requested names; a whole-taxonomy count is a 3-table scan.
  const countsMapPromise = countPostsByTaxonomy(db, { kind: 'tag', gate: 'public', names: uniqueNames })
  const [tagRows, countsMap] = await Promise.all([tagRowsPromise, countsMapPromise])

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

// Feed-only: accept slug or legacy display name; public routes stay slug-only (plan 080, Q1).
export async function resolveTagBySlugOrName(db: Database, value: string): Promise<TagRow | null> {
  return (await findTagBySlug(db, value)) ?? (await findTagByName(db, value))
}

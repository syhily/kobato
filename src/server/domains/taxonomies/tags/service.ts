import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { asc, inArray } from 'drizzle-orm'

import type { TagRow } from '@/server/infra/db/types'
import type { Tag } from '@/shared/types/catalog'
import type { AdminTagDto } from '@/shared/types/tags'

import { listPostTitlesByTaxonomy } from '@/server/domains/posts/repos/public-query/taxonomy'
import { countPostsByTaxonomy } from '@/server/domains/taxonomies/counts'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
} from '@/server/domains/taxonomies/shared'
import { createRedisCache } from '@/server/infra/cache/redis-cache'
import {
  type AdminTagsListFilters,
  countAdminTags,
  deleteTag as deleteTagRow,
  findTagById,
  findTagByName,
  findTagBySlug,
  insertTag,
  listAdminTagRows,
  updateTag,
} from '@/server/infra/db/operations/tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { createInflight } from '@/server/infra/redis/inflight'
import { resolveSlugForTaxonomy } from '@/server/infra/slug'
import { hasAtLeast, type Role } from '@/shared/utils/roles'

const log = getLogger('tags.service')

// Wire-format DTO for every admin tag endpoint. `postCount` is
// projected by the caller from `countPostsByTaxonomy` (mirrors the
// category service shape).
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
  /** True when `offset + rows.length < total` (i.e. another page exists). */
  hasMore: boolean
}

// Server-side pagination: parallel `[rows, total, postCounter]` so we
// pay only one round-trip for the page-of-rows query, the COUNT(*),
// and the per-term counts. `total` is the full filtered count
// (independent of `offset`/`limit`) so the client can render the
// correct number of pagination buttons.
export async function listTagsForAdmin(
  db: NodePgDatabase,
  filters: AdminTagsListFilters,
): Promise<AdminTagsListResult> {
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
  id?: bigint
  name: string
  slug?: string
  ogImage?: string
}

export interface TagViewerContext {
  userId: string
  role: Role
}

export async function upsertAdminTag(
  db: NodePgDatabase,
  input: UpsertTagInputs,
  viewer?: TagViewerContext,
): Promise<AdminTagDto> {
  const slug = resolveSlugForTaxonomy(input.slug, input.name)

  if (input.id === undefined) {
    await ensureUniqueOnCreateTaxonomy(
      (name) => findTagByName(db, name),
      (slug) => findTagBySlug(db, slug),
      input.name,
      slug,
      '标签',
    )
    const row = await insertTag(db, { name: input.name, slug, ogImage: input.ogImage ?? '' })
    await clearTagCache().catch((err: unknown) => {
      log.warn('clear tag cache failed', { error: err })
    })
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
  await clearTagCache().catch((err: unknown) => {
    log.warn('clear tag cache failed', { error: err })
  })
  const counts = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'admin', name: updated.name })
  return toAdminTagDto(updated, counts.get(updated.name) ?? 0)
}

// Block-only deletion regardless of role. `deleteAdminTaxonomy` refuses
// to remove a tag while any post still lists it in its frontmatter
// `tags: [...]` — this is the project's intentional stricter-than-
// RBAC-design fence: we never orphan posts, even when an admin clicks
// delete. Authors get the same UX as admins because the cross-check is
// global to the tag, not the viewer. Same contract as
// `deleteAdminCategory`.
export async function deleteAdminTag(db: NodePgDatabase, id: bigint, _viewer?: TagViewerContext): Promise<boolean> {
  const deleted = await deleteAdminTaxonomy(id, '标签', {
    findById: (id) => findTagById(db, id),
    deleteRow: (id) => deleteTagRow(db, id),
    listPostTitles: (name) => listPostTitlesByTaxonomy(db, 'tag', name),
  })
  if (deleted) {
    await clearTagCache().catch((err: unknown) => {
      log.warn('clear tag cache failed', { error: err })
    })
  }
  return deleted
}

// --- Public catalog queries -------------------------------------------------

const tagCache = createRedisCache<Tag[]>('tags:all', { ttlMs: 30_000 })
const tagInflight = createInflight<Tag[]>()

/** Drop the cached public tag list (call after any tag/content mutation). */
export async function clearTagCache(): Promise<void> {
  await tagCache.clear()
}

export async function listAllTags(db: NodePgDatabase): Promise<Tag[]> {
  const cached = await tagCache.get()
  if (cached !== null) {
    return cached
  }

  return tagInflight('listAllTags', async () => {
    const cachedInner = await tagCache.get()
    if (cachedInner !== null) {
      return cachedInner
    }

    const tagRows = await db
      .select({ name: tagTable.name, slug: tagTable.slug })
      .from(tagTable)
      .orderBy(asc(tagTable.name))

    if (tagRows.length === 0) {
      await tagCache.set([])
      return []
    }

    const countsMap = await countPostsByTaxonomy(db, { kind: 'tag', gate: 'public' })

    const tags = tagRows.map((row) => ({
      name: row.name,
      slug: row.slug,
      counts: countsMap.get(row.name) ?? 0,
      permalink: `/tags/${row.slug}`,
    }))

    await tagCache.set(tags)
    return tags
  })
}

export async function getTagsByNames(db: NodePgDatabase, names: readonly string[]): Promise<Tag[]> {
  if (names.length === 0) {
    return []
  }
  const uniqueNames = [...new Set(names)]

  const tagRowsPromise = db
    .select({ name: tagTable.name, slug: tagTable.slug })
    .from(tagTable)
    .where(inArray(tagTable.name, uniqueNames))
  const countsMapPromise = countPostsByTaxonomy(db, { kind: 'tag', gate: 'public' })
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

// Feed-only resolution rule: feed URLs accept a tag slug, but legacy
// subscribers may carry the display name. Public routes stay slug-only
// (plan 080, Q1). Deliberately shallow: one composition, no state, no cache.
export async function resolveTagBySlugOrName(db: NodePgDatabase, value: string): Promise<TagRow | null> {
  return (await findTagBySlug(db, value)) ?? (await findTagByName(db, value))
}

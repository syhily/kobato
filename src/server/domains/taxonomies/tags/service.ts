import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { asc, inArray, sql } from 'drizzle-orm'

import type { TagRow } from '@/server/infra/db/types'
import type { Tag } from '@/shared/types/catalog'
import type { AdminTagDto } from '@/shared/types/tags'

import { hasAtLeast, type Role } from '@/server/domains/auth/rbac'
import { listPostsByTag, listPublicPosts } from '@/server/domains/posts/repos/public-query'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
  resolveSlugForTaxonomy,
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
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { createInflight } from '@/server/infra/redis/inflight'
import { readStringArray } from '@/shared/utils/tools'

// Wire-format DTO for every admin tag endpoint. `postCount` is
// projected by the caller from the live `ContentCatalog` (mirrors
// the category service shape). See `tagPostCounter`.
export function toAdminTagDto(row: TagRow, postCount: number): AdminTagDto {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
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

// Single catalog snapshot + per-row map lookup. Counts include
// hidden + scheduled posts so the column matches what the
// delete-block guard sees.
async function tagPostCounter(db: NodePgDatabase): Promise<(name: string) => Promise<number>> {
  return async (name: string) => {
    const posts = await listPostsByTag(db, name, { includeHidden: true, includeScheduled: true })
    return posts.length
  }
}

// Bulk-count posts per tag in a single query, then project into a Map.
// Replaces the N+1 `tagPostCounter` for list views while keeping the
// per-tag helper for single-row upserts.
async function countPostsByTags(db: NodePgDatabase): Promise<Map<string, number>> {
  const metas = await listPublicPosts(db, { includeHidden: true, includeScheduled: true })
  const counts = new Map<string, number>()
  for (const meta of metas) {
    const tags = readStringArray(meta.tags)
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return counts
}

// Server-side pagination: parallel `[rows, total, postCounter]` so we
// pay only one round-trip for the page-of-rows query, the COUNT(*),
// and the catalog snapshot. `total` is the full filtered count
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
    countPostsByTags(db),
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
    const row = await insertTag(db, { name: input.name, slug })
    const countOf = await tagPostCounter(db)
    return toAdminTagDto(row, await countOf(row.name))
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
  const updated = await updateTag(db, input.id, { name: input.name, slug })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '标签不存在')
  }
  const countOf = await tagPostCounter(db)
  return toAdminTagDto(updated, await countOf(updated.name))
}

// Block-only deletion regardless of role. `deleteAdminTaxonomy` refuses
// to remove a tag while any post still lists it in its frontmatter
// `tags: [...]` — this is the project's intentional stricter-than-
// RBAC-design fence: we never orphan posts, even when an admin clicks
// delete. Authors get the same UX as admins because the cross-check is
// global to the tag, not the viewer. Same contract as
// `deleteAdminCategory`.
export async function deleteAdminTag(db: NodePgDatabase, id: bigint, _viewer?: TagViewerContext): Promise<boolean> {
  return deleteAdminTaxonomy(id, '标签', {
    findById: (id) => findTagById(db, id),
    deleteRow: (id) => deleteTagRow(db, id),
    listPostsBy: (name) => listPostsByTag(db, name),
  })
}

// --- Public catalog queries -------------------------------------------------

const tagCache = createRedisCache<Tag[]>('tags:all', { ttlMs: 30_000 })
const tagInflight = createInflight<Tag[]>()

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

    const now = new Date()

    const tagRows = await db
      .select({ name: tagTable.name, slug: tagTable.slug })
      .from(tagTable)
      .orderBy(asc(tagTable.name))

    if (tagRows.length === 0) {
      await tagCache.set([])
      return []
    }

    const countsResult = await db.execute<{ tag_name: string; counts: number }>(sql`
      SELECT jsonb_array_elements_text(${postMetaTable.tags}) AS tag_name,
             COUNT(*)::int AS counts
      FROM ${postMetaTable}
      WHERE ${postMetaTable.deletedAt} IS NULL
        AND ${postMetaTable.published} = true
        AND ${postMetaTable.visible} = true
        AND ${postMetaTable.publishedAt} <= ${now}
      GROUP BY jsonb_array_elements_text(${postMetaTable.tags})
    `)

    const countsMap = new Map<string, number>()
    for (const row of countsResult.rows) {
      countsMap.set(row.tag_name, row.counts)
    }

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
  const now = new Date()

  const tagRowsPromise = db
    .select({ name: tagTable.name, slug: tagTable.slug })
    .from(tagTable)
    .where(inArray(tagTable.name, uniqueNames))
  const countsResultPromise = db.execute<{ tag_name: string; counts: number }>(sql`
    SELECT jsonb_array_elements_text(${postMetaTable.tags}) AS tag_name,
           COUNT(*)::int AS counts
    FROM ${postMetaTable}
    WHERE ${postMetaTable.deletedAt} IS NULL
      AND ${postMetaTable.published} = true
      AND ${postMetaTable.visible} = true
      AND ${postMetaTable.publishedAt} <= ${now}
    GROUP BY jsonb_array_elements_text(${postMetaTable.tags})
  `)
  const [tagRows, countsResult] = (await Promise.all([tagRowsPromise, countsResultPromise])) as [
    Awaited<typeof tagRowsPromise>,
    Awaited<typeof countsResultPromise>,
  ]

  if (tagRows.length === 0) {
    return []
  }

  const countsMap = new Map<string, number>()
  for (const row of countsResult.rows) {
    countsMap.set(row.tag_name, row.counts)
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

  return uniqueNames.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]
}

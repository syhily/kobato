import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost } from '@/shared/types/catalog'

import { liveContentWhere, type LiveContentOptions } from '@/server/domains/content/schema'
import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag } from '@/server/infra/db/schema/taxonomy'
import { readStringArray } from '@/shared/utils/tools'

export type PostMetaWithAuthor = PostMetaRow & { authorName: string | null }

/**
 * Repo-side binding of the live gate for the `post` table. Binds the
 * four meta columns once and delegates to `liveContentWhere`, so call
 * sites never hand-assemble the column struct (and can't drift into
 * their own copy of the gate). See the warning on `isLive` in
 * `content/schema.ts`.
 */
export function livePostWhere(options?: LiveContentOptions): SQL {
  return liveContentWhere(
    {
      deletedAt: postMetaTable.deletedAt,
      published: postMetaTable.published,
      publishedRevisionId: postMetaTable.publishedRevisionId,
      publishedAt: postMetaTable.publishedAt,
    },
    options,
  )
}

export interface ListPostsFilters {
  /** Free-text query matched case-insensitively against `slug` and `title`. */
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
  /** Zero-based offset for pagination. */
  offset?: number
  /** Page size. When undefined every match is returned. */
  limit?: number
  /** Filter by category name. */
  category?: string
  /** Filter by tag name (JSONB contains). */
  tag?: string
  /** Filter by published flag. */
  published?: boolean
  /** Filter by visible flag. */
  visible?: boolean
  /** Sort field. */
  sortBy?: 'publishedAt' | 'updatedAt'
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc'
  /** Filter by author id. */
  authorId?: bigint
  /**
   * Coarse lifecycle bucket — partitions every live row into one of two
   * sets that match the `StatusBadge` logic in `PostsView`:
   *   - `'published'`: `published = true AND published_revision_id IS NOT NULL`
   *                   (publicly visible on the site).
   *   - `'draft'`: everything else (`published = false`, OR
   *                `published_revision_id IS NULL` meaning the row has
   *                only ever held draft revisions / was never promoted).
   *
   * Use this for "drafts vs published" dashboards instead of `published`
   * alone — the boolean flag misses the common "freshly created but
   * not yet promoted" case where the row sits at `published = true`,
   * `published_revision_id = NULL` and is what users intuitively call
   * a draft.
   */
  lifecycle?: 'draft' | 'published'
}

export function buildPostsWhere(filters: ListPostsFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.deletedStatus === 'deleted') {
    conditions.push(isNotNull(postMetaTable.deletedAt))
  } else if (filters.deletedStatus === 'normal') {
    conditions.push(isNull(postMetaTable.deletedAt))
  }
  if (filters.q && filters.q.trim() !== '') {
    const search = or(
      ilikeEscape(postMetaTable.slug, filters.q.trim()),
      ilikeEscape(postMetaTable.title, filters.q.trim()),
    )
    if (search) {
      conditions.push(search)
    }
  }
  if (filters.category) {
    conditions.push(eq(postMetaTable.category, filters.category))
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${postTag}
        INNER JOIN ${tag} ON ${eq(postTag.tagId, tag.id)}
        WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tag.name, filters.tag)}
      )`,
    )
  }
  if (filters.published !== undefined) {
    conditions.push(eq(postMetaTable.published, filters.published))
  }
  if (filters.visible !== undefined) {
    conditions.push(eq(postMetaTable.visible, filters.visible))
  }
  if (filters.authorId !== undefined) {
    conditions.push(eq(postMetaTable.authorId, filters.authorId))
  }
  if (filters.lifecycle === 'published') {
    conditions.push(eq(postMetaTable.published, true), isNotNull(postMetaTable.publishedRevisionId))
  } else if (filters.lifecycle === 'draft') {
    const draftClause = or(eq(postMetaTable.published, false), isNull(postMetaTable.publishedRevisionId))
    if (draftClause !== undefined) {
      conditions.push(draftClause)
    }
  }
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

export function buildPostsOrderBy(filters: ListPostsFilters) {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return filters.sortOrder === 'asc' ? asc(col) : desc(col)
}

export interface ListPublicPostsFilters {
  category?: string
  tag?: string
  includeHidden?: boolean
  includeScheduled?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  limit?: number
  offset?: number
}

/** Public `date` is first publication time; falls back to `published_at` before the first publish. */
export function toClientPostFromMeta(meta: PostMetaRow, tags: string[] = []): ClientPost {
  const date = meta.firstPublishedAt ?? meta.publishedAt
  return {
    id: String(meta.id),
    title: meta.title,
    date,
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    alias: readStringArray(meta.alias),
    tags,
    category: meta.category,
    summary: meta.summary,
    cover: meta.cover || '/images/open-graph.png',
    og: meta.og ?? undefined,
    published: meta.published,
    visible: meta.visible,
    toc: meta.showToc,
    showUpdated: meta.showUpdated,
    slug: meta.slug,
    permalink: `/posts/${meta.slug}`,
    headings: [],
    pinnedAt: meta.pinnedAt ?? undefined,
  }
}

export function buildPublicPostsWhere(filters: ListPublicPostsFilters, now = new Date()): SQL {
  const conditions: SQL[] = [livePostWhere({ asOf: now, includeScheduled: filters.includeScheduled })]

  if (!filters.includeHidden) {
    conditions.push(eq(postMetaTable.visible, true))
  }
  if (filters.category) {
    conditions.push(eq(postMetaTable.category, filters.category))
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${postTag}
        INNER JOIN ${tag} ON ${eq(postTag.tagId, tag.id)}
        WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tag.name, filters.tag)}
      )`,
    )
  }

  return and(...conditions)!
}

import { and, asc, desc, eq, not, sql, type SQL } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost } from '@/shared/types/catalog'

import { buildMetaListWhere, type MetaListFiltersBase } from '@/server/domains/content/entities/meta-repo'
import { livePostWhere, promotedPostWhere } from '@/server/domains/posts/live-gate'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag } from '@/server/infra/db/schema/taxonomy'
import { readStringArray } from '@/shared/utils/tools'

export type PostMetaWithAuthor = PostMetaRow & { authorName: string | null }

export interface ListPostsFilters extends MetaListFiltersBase {
  /** Filter by category id. */
  categoryId?: number
  /** Filter by tag name (JSONB contains). */
  tag?: string
  /** Filter by visible flag. */
  visible?: boolean
  /** Sort field. */
  sortBy?: 'publishedAt' | 'updatedAt'
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc'
  /**
   * Coarse lifecycle bucket — partitions every live row into one of two
   * sets that match the `PostStatusText` logic in `PostRow`, routed
   * through the promoted gate (`promotedPostWhere`):
   *   - `'published'`: promoted — `published = true AND
   *                    published_revision_id IS NOT NULL` (has a
   *                    published revision to show).
   *   - `'draft'`: not promoted (`published = false`, OR
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

/**
 * Posts' admin-list WHERE: the shared legs (deletion state, slug/title
 * search, published, author) come from `buildMetaListWhere`; the
 * taxonomy / visible / lifecycle legs below are post-specific. SQL
 * `AND` is order-insensitive, so the leg order change vs the old
 * hand-built clause is semantic-noop.
 */
export function buildPostsWhere(filters: ListPostsFilters): SQL | undefined {
  const extras: SQL[] = []
  if (filters.categoryId !== undefined) {
    extras.push(eq(postMetaTable.categoryId, filters.categoryId))
  }
  if (filters.tag) {
    extras.push(
      sql`EXISTS (
        SELECT 1 FROM ${postTag}
        INNER JOIN ${tag} ON ${eq(postTag.tagId, tag.id)}
        WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tag.name, filters.tag)}
      )`,
    )
  }
  if (filters.visible !== undefined) {
    extras.push(eq(postMetaTable.visible, filters.visible))
  }
  if (filters.lifecycle === 'published') {
    extras.push(promotedPostWhere())
  } else if (filters.lifecycle === 'draft') {
    extras.push(not(promotedPostWhere()))
  }
  return buildMetaListWhere(postMetaTable, filters, extras)
}

export function buildPostsOrderBy(filters: ListPostsFilters) {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return filters.sortOrder === 'asc' ? asc(col) : desc(col)
}

export interface ListPublicPostsFilters {
  categoryId?: number
  tag?: string
  includeHidden?: boolean
  includeScheduled?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  limit?: number
  offset?: number
}

/** Public `date` is first publication time; falls back to `published_at` before the first publish. */
export function toClientPostFromMeta(meta: PostMetaRow, tags: string[] = [], categoryName = ''): ClientPost {
  const date = meta.firstPublishedAt ?? meta.publishedAt
  return {
    id: String(meta.id),
    title: meta.title,
    date,
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    alias: readStringArray(meta.alias),
    tags,
    category: categoryName,
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
  if (filters.categoryId !== undefined) {
    conditions.push(eq(postMetaTable.categoryId, filters.categoryId))
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

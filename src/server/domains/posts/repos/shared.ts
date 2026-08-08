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
  categoryId?: number
  tag?: string
  visible?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  /**
   * Lifecycle bucket through the promoted gate: `'published'` is promoted;
   * `'draft'` includes the `published=true` row with a NULL `published_revision_id`.
   */
  lifecycle?: 'draft' | 'published'
}

/**
 * Admin-list WHERE: shared legs from `buildMetaListWhere` plus the
 * post-specific taxonomy / visible / lifecycle legs.
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

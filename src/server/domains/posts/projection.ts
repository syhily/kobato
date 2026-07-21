import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { readBody, readHeadings } from '@/server/domains/content/projection-helpers'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { readStringArray } from '@/shared/utils/tools'

// --- Public catalog projection ----------------------------------------------

// `toCmsPost` returns the shared `Post` DTO directly (`@/shared/types/catalog`)
// — there is no server-side variant of the shape.
export function toCmsPost(
  meta: PostMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
    tags?: string[]
    categoryName?: string
  } = {},
): Post {
  const body = publishedRevision !== null ? readBody(publishedRevision.body) : []
  const imageSources = publishedRevision !== null ? readStringArray(publishedRevision.imageSources) : []
  const headings = publishedRevision !== null ? readHeadings(publishedRevision.headings) : []

  // Compose, don't copy: the ~20 catalog fields come from the shared
  // projection (`toClientPostFromMeta`); only the revision-joined CMS
  // fields are stated here. `headings` overrides the projection's empty
  // default when a published revision carries real anchors.
  return {
    ...toClientPostFromMeta(meta, options.tags ?? [], options.categoryName ?? ''),
    coverThumbhash: options.coverThumbhash,
    headings,
    body,
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
  }
}

// --- Admin projection -------------------------------------------------------

export interface AdminPostDto {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  og: string | null
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  visible: boolean
  publishedAt: string
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  category: string
  categoryId: string | null
  tags: string[]
  alias: string[]
  authorId: string | null
  authorName: string | null
  pinnedAt: string | null
  /** Null until the first successful publish. */
  firstPublishedAt: string | null
  /**
   * Approved comment count for this post's metric row. Populated by
   * `listPostsForAdmin`; defaults to `0` on detail / save paths that
   * don't need to fan out an extra query.
   */
  commentCount: number
  /**
   * The post's `metric.public_id` UUID — the opaque wire identifier
   * the admin comment-count link uses to deep-link into
   * `/admin/comments?pageKey=<uuid>`. Empty string on detail / save
   * paths that don't fan out a metric upsert.
   */
  commentPublicId: string
}

export function toAdminPostDto(
  row: PostMetaRow & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string; tags?: string[]; categoryName?: string } = {},
): AdminPostDto {
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    cover: row.cover,
    og: row.og,
    published: row.published,
    commentsEnabled: row.commentsEnabled,
    showToc: row.showToc,
    showUpdated: row.showUpdated,
    visible: row.visible,
    publishedAt: row.publishedAt.toISOString(),
    publishedRevisionId: row.publishedRevisionId === null ? null : String(row.publishedRevisionId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    category: options.categoryName ?? '',
    categoryId: row.categoryId === null ? null : String(row.categoryId),
    tags: options.tags ?? [],
    alias: readStringArray(row.alias),
    authorId: row.authorId === null ? null : String(row.authorId),
    authorName: (row as { authorName?: string | null }).authorName ?? null,
    pinnedAt: row.pinnedAt === null ? null : row.pinnedAt.toISOString(),
    firstPublishedAt: row.firstPublishedAt === null ? null : row.firstPublishedAt.toISOString(),
    commentCount: options.commentCount ?? 0,
    commentPublicId: options.commentPublicId ?? '',
  }
}

export interface AdminPostDetailDto {
  post: AdminPostDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

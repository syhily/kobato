import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { ClientPost } from '@/shared/types/catalog'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { readBody, readHeadings } from '@/server/domains/content/projection-helpers'
import { readStringArray } from '@/shared/utils/tools'

// --- Public catalog projection ----------------------------------------------

export interface CmsPost extends ClientPost {
  body: PortableTextBody
  imageSources: string[]
  publishedRevisionId: bigint | null
}

export function toCmsPost(
  meta: PostMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
  } = {},
): CmsPost {
  const body = publishedRevision !== null ? readBody(publishedRevision.body) : []
  const imageSources = publishedRevision !== null ? readStringArray(publishedRevision.imageSources) : []
  const headings = publishedRevision !== null ? readHeadings(publishedRevision.headings) : []

  return {
    id: String(meta.id),
    title: meta.title,
    date: meta.firstPublishedAt ?? meta.publishedAt,
    /** Public catalog: mirrors `published_at` (publish / schedule), not draft saves. */
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    alias: readStringArray(meta.alias),
    tags: readStringArray(meta.tags),
    category: meta.category,
    summary: meta.summary,
    cover: meta.cover || '/images/open-graph.png',
    coverThumbhash: options.coverThumbhash,
    og: meta.og ?? undefined,
    published: meta.published,
    visible: meta.visible,
    toc: meta.showToc,
    showUpdated: meta.showUpdated,
    slug: meta.slug,
    permalink: `/posts/${meta.slug}`,
    headings,
    body,
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
    pinnedAt: meta.pinnedAt ?? undefined,
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
  options: { commentCount?: number; commentPublicId?: string } = {},
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
    category: row.category,
    tags: readStringArray(row.tags),
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

export function toAdminRevisionDto(row: ContentRow): AdminRevisionDto {
  return {
    id: String(row.id),
    revisionNo: row.revisionNo,
    status: row.status === 'published' ? 'published' : 'draft',
    body: readBody(row.body),
    imageSources: readStringArray(row.imageSources),
    headings: readHeadings(row.headings),
    authorId: row.authorId === null ? null : String(row.authorId),
    clientRevisionToken: row.clientRevisionToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

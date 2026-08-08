import type { MetaRowBase } from '@/server/domains/content/entities/descriptor'

/**
 * The 19 admin-DTO fields every content entity shares, projected from
 * the shared meta columns. Bigint ids are stringified — the admin
 * contract declares strings up front.
 */
export interface AdminMetaDto {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  og: string | null
  published: boolean
  commentsEnabled: boolean
  webmentionsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  publishedAt: string
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  authorId: string | null
  authorName: string | null
  /** Approved comment count for the row's metric row; populated by the admin list, defaults to `0` elsewhere. */
  commentCount: number
  /** The row's `metric.public_id` UUID — the admin comment-count deep-link target; empty string outside the admin list. */
  commentPublicId: string
}

export function toAdminMetaDto(
  row: MetaRowBase & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string } = {},
): AdminMetaDto {
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    cover: row.cover,
    og: row.og,
    published: row.published,
    commentsEnabled: row.commentsEnabled,
    webmentionsEnabled: row.webmentionsEnabled,
    showToc: row.showToc,
    showUpdated: row.showUpdated,
    publishedAt: row.publishedAt.toISOString(),
    publishedRevisionId: row.publishedRevisionId === null ? null : String(row.publishedRevisionId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    authorId: row.authorId === null ? null : String(row.authorId),
    authorName: row.authorName ?? null,
    commentCount: options.commentCount ?? 0,
    commentPublicId: options.commentPublicId ?? '',
  }
}

import type { MetaRowBase } from '@/server/domains/content/entities/descriptor'

/**
 * The 19 admin-DTO fields every content entity shares, projected from
 * the shared meta columns. Entity DTOs extend this with their extras
 * (post: visible/category/tags/alias/pinnedAt/firstPublishedAt; page:
 * showFriends) — see `AdminPostDto` / `AdminPageDto`.
 *
 * Bigint ids stringified because the JSON envelope helper coerces them,
 * but the admin UI expects the contract to declare strings up front so
 * the React components don't have to know about the coercion.
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
  showToc: boolean
  showUpdated: boolean
  publishedAt: string
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  authorId: string | null
  authorName: string | null
  /**
   * Approved comment count for the row's metric row. Populated by the
   * admin list; defaults to `0` on detail / save paths that don't need
   * to fan out an extra query.
   */
  commentCount: number
  /**
   * The row's `metric.public_id` UUID — the opaque wire identifier the
   * admin comment-count link uses to deep-link into
   * `/admin/comments?pageKey=<uuid>`. Empty string on detail / save
   * paths that don't fan out a metric upsert.
   */
  commentPublicId: string
}

/**
 * Shared projection behind `toAdminPostDto` / `toAdminPageDto`: the 19
 * common fields, engagement counters included. Entity projections
 * spread this and append their extras.
 */
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

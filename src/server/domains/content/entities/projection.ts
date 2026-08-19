import type { MetaRowBase } from '@/server/domains/content/entities/descriptor'
import type { AdminMetaBaseDto } from '@/shared/contracts/admin-meta'

// The shared admin-DTO fields are zod-derived from `adminMetaBaseDto`
// (`@/shared/contracts/admin-meta`) — this module keeps only the real
// transform from the shared meta columns (bigint ids stringified,
// Dates → ISO strings).
export type AdminMetaDto = AdminMetaBaseDto

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

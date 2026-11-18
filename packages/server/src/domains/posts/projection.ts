import type { Post } from '@kobato/catalog/catalog.ts'
import type { AdminPostDto } from '@kobato/contracts/posts.ts'
import type { ContentRow, PostMetaRow } from '@kobato/db/types.ts'

import { toAdminMetaDto } from '@kobato/server/domains/content/entities/projection.ts'
import { readRevisionProjection } from '@kobato/server/domains/content/projection-helpers.ts'
import { toClientPostFromMeta } from '@kobato/server/domains/posts/repos/shared.ts'
import { readStringArray } from '@kobato/server/infra/coerce.ts'

// `toCmsPost` returns the shared `Post` DTO directly — no server-side variant.
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
  const { bodyHtml, bodyHtmlFeed, bodyState, imageSources, headings } = readRevisionProjection(publishedRevision)

  // Compose from `toClientPostFromMeta`; only revision-joined fields are
  // stated here — `headings` overrides the projection's empty default.
  return {
    ...toClientPostFromMeta(meta, options.tags ?? [], options.categoryName ?? ''),
    coverThumbhash: options.coverThumbhash,
    headings,
    bodyHtml,
    bodyHtmlFeed,
    bodyState,
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
  }
}

export function toAdminPostDto(
  row: PostMetaRow & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string; tags?: string[]; categoryName?: string } = {},
): AdminPostDto {
  return {
    ...toAdminMetaDto(row, options),
    visible: row.visible,
    category: options.categoryName ?? '',
    categoryId: row.categoryId === null ? null : String(row.categoryId),
    tags: options.tags ?? [],
    alias: readStringArray(row.alias),
    pinnedAt: row.pinnedAt === null ? null : row.pinnedAt.toISOString(),
    firstPublishedAt: row.firstPublishedAt === null ? null : row.firstPublishedAt.toISOString(),
  }
}

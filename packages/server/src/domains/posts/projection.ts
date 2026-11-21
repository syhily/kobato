import type { AdminPostDto } from '@kobato/api/contracts/posts'
import type { Post } from '@kobato/catalog/model'
import type { ContentRow, PostMetaRow } from '@kobato/db/types'

import { toAdminMetaDto } from '@kobato/server/domains/content/entities/projection'
import { readRevisionProjection } from '@kobato/server/domains/content/projection-read'
import { toClientPostFromMeta } from '@kobato/server/domains/posts/repos/shared'
import { readStringArray } from '@kobato/server/infra/coerce'

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

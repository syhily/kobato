import type { AdminPageDto } from '@kobato/contracts/pages.ts'
import type { Page } from '@kobato/contracts/types/catalog.ts'
import type { ContentRow, PageMetaRow } from '@kobato/db/types.ts'

import { toAdminMetaDto } from '@kobato/server/domains/content/entities/projection.ts'
import { readRevisionProjection } from '@kobato/server/domains/content/projection-helpers.ts'

// Catalog-facing projection; pages without a published revision surface with an empty body and no headings.
export function toCmsPage(
  meta: PageMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
  } = {},
): Page {
  const { bodyHtml, bodyHtmlFeed, bodyState, imageSources, headings } = readRevisionProjection(publishedRevision)

  return {
    id: String(meta.id),
    title: meta.title,
    date: meta.firstPublishedAt ?? meta.publishedAt,
    /** Public catalog: mirrors `published_at` (publish / schedule), not draft saves. */
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    cover: meta.cover,
    coverThumbhash: options.coverThumbhash,
    coverWidth: options.coverWidth,
    coverHeight: options.coverHeight,
    og: meta.og ?? undefined,
    published: meta.published,
    summary: meta.summary,
    toc: meta.showToc,
    showUpdated: meta.showUpdated,
    contentLanguage: meta.contentLanguage,
    showFriends: meta.showFriends,
    slug: meta.slug,
    permalink: `/${meta.slug}`,
    headings,
    bodyHtml,
    bodyHtmlFeed,
    bodyState,
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
  }
}

export function toAdminPageDto(
  row: PageMetaRow & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string } = {},
): AdminPageDto {
  return {
    ...toAdminMetaDto(row, options),
    showFriends: row.showFriends,
  }
}

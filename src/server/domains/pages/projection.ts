import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'
import type { AdminPageDto } from '@/shared/contracts/pages'
import type { Page } from '@/shared/types/catalog'

import { toAdminMetaDto } from '@/server/domains/content/entities/projection'
import { readRevisionProjection } from '@/server/domains/content/projection-helpers'

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
  const { body, bodyHtml, bodyState, imageSources, headings } = readRevisionProjection(publishedRevision)

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
    showFriends: meta.showFriends,
    slug: meta.slug,
    permalink: `/${meta.slug}`,
    headings,
    body,
    bodyHtml,
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

import type { ContentRow, PageMetaRow } from '@kobato/server/infra/db/types'
import type { AdminRevisionDto } from '@kobato/shared/contracts/revision'
import type { Page } from '@kobato/shared/types/catalog'

import { toAdminMetaDto, type AdminMetaDto } from '@kobato/server/domains/content/entities/projection'
import { readRevisionProjection } from '@kobato/server/domains/content/projection-helpers'

// --- Public catalog projection ----------------------------------------------

// `toCmsPage` is the catalog-facing projection: meta row + published
// revision (or null) → the shared `Page` DTO (`@/shared/types/catalog`)
// directly — there is no server-side variant of the shape. Pages
// without a published revision still surface in the catalog with an
// empty body and no headings.
export function toCmsPage(
  meta: PageMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
  } = {},
): Page {
  const { body, imageSources, headings } = readRevisionProjection(publishedRevision)

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
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
  }
}

// --- Admin projection -------------------------------------------------------

// Wire DTO returned by every admin page endpoint. The shared 19 fields
// come from `AdminMetaDto` (`content/entities/projection.ts`); only the
// page-only friends flag is stated here.
export interface AdminPageDto extends AdminMetaDto {
  showFriends: boolean
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

// Editor "load" DTO — the admin page edit route returns this so the
// browser hydrates the Tiptap editor and the metadata panel from one
// round trip. `body` comes from the *latest* revision (draft preferred)
// so reopening restores in-progress edits.
export interface AdminPageDetailDto {
  page: AdminPageDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'
import type { AdminRevisionDto } from '@/shared/contracts/revision'
import type { Page } from '@/shared/types/catalog'

import { toAdminMetaDto, type AdminMetaDto } from '@/server/domains/content/entities/projection'
import { readRevisionProjection } from '@/server/domains/content/projection-helpers'

// --- Public catalog projection ----------------------------------------------

// `toCmsPage` is the catalog-facing projection: it accepts the meta
// row joined with the published revision (or null when the page has
// never been published) and produces the shared `Page` DTO
// (`@/shared/types/catalog`) directly — there is no server-side variant
// of the shape. Pages without a published revision still surface in the
// catalog (so the admin can link to them while drafting), but with an
// empty body and no headings — the public detail route renders an
// empty body.
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
// browser can hydrate the Tiptap editor *and* the metadata panel from
// one round trip. The `body` slot is the *latest* revision (draft
// preferred over published) so reopening the editor restores
// in-progress edits, while `publishedRevisionId` lets the UI badge
// the editor as "published" / "has unpublished changes" / "draft only".
export interface AdminPageDetailDto {
  page: AdminPageDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

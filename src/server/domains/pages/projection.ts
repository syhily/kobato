import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { ClientPage } from '@/shared/types/catalog'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { readBody, readHeadings } from '@/server/domains/content/projection-helpers'
import { DomainError } from '@/server/infra/http/errors'
import { readStringArray } from '@/shared/utils/tools'

// --- Public catalog projection ----------------------------------------------

// SSR-rendered `Page` DTO returned by the catalog. Mirrors the
// historical `ClientPage` shape exactly so the public detail route +
// SEO + feeds carry forward unchanged. The `body` slot now carries
// PortableText (was MDXContent), and `imageSources` flows from the
// `content` revision rather than from the MDX AST.
export interface CmsPage extends ClientPage {
  /** PortableText payload. Empty array for pages whose published revision is missing. */
  body: PortableTextBody
  imageSources: string[]
  /** The `content.id` whose body is being rendered (used for cache keys / debug). */
  publishedRevisionId: bigint | null
}

// `toCmsPage` is the catalog-facing projection: it accepts the meta
// row joined with the published revision (or null when the page has
// never been published) and produces the public DTO. Pages without a
// published revision still surface in the catalog (so the admin can
// link to them while drafting), but with an empty body and no
// headings — the public detail route renders an empty body.
export function toCmsPage(
  meta: PageMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
  } = {},
): CmsPage {
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

// `toCmsPost` is **reserved** for the next migration. The current
// iteration ships only the page editor, so emitting a stub here means
// callers can already write `import { toCmsPost } from
// '@/server/domains/pages/projection'` without circular re-exports later.
//
// When the post migration lands this signature will widen to accept
// the `PostRow` (currently named `metric`-row in legacy callers) and
// projects it into `ClientPost`.
export function toCmsPost(): never {
  throw new DomainError('INTERNAL', 'toCmsPost is reserved for the next iteration; posts are still served from MDX')
}

// --- Admin projection -------------------------------------------------------

// Wire DTO returned by every admin page endpoint. Bigint ids stringified
// because the JSON envelope helper coerces them, but the admin UI
// expects the contract to declare strings up front so the React
// components don't have to know about the coercion.
export interface AdminPageDto {
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
  showFriends: boolean
  publishedAt: string
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  authorId: string | null
  authorName: string | null
  /**
   * Approved comment count for this page's metric row. Populated by
   * `listPagesForAdmin`; defaults to `0` on detail / save paths.
   */
  commentCount: number
  /**
   * The page's `metric.public_id` UUID — the opaque wire identifier the
   * admin comment-count link uses to deep-link into
   * `/admin/comments?pageKey=<uuid>`. Empty string on detail / save
   * paths that don't fan out a metric upsert.
   */
  commentPublicId: string
}

export function toAdminPageDto(
  row: PageMetaRow & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string } = {},
): AdminPageDto {
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
    showFriends: row.showFriends,
    publishedAt: row.publishedAt.toISOString(),
    publishedRevisionId: row.publishedRevisionId === null ? null : String(row.publishedRevisionId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    authorId: row.authorId === null ? null : String(row.authorId),
    authorName: (row as { authorName?: string | null }).authorName ?? null,
    commentCount: options.commentCount ?? 0,
    commentPublicId: options.commentPublicId ?? '',
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

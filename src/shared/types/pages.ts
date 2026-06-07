import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/types/catalog'
import type { AdminRevisionDto } from '@/shared/types/revision'
export type { AdminRevisionDto }

// Wire-format DTOs for the `/admin/pages` editor and the
// `/api/admin/list-pages` oRPC procedure. Lives in `@/shared`
// so server and client import the same shape without crossing
// the boundary. Bigints are stringified.

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
  /** Render the「修改于 XXXX」secondary timestamp on the public detail page. */
  showUpdated: boolean
  /** Render the global friends grid at the bottom of the page detail route. */
  showFriends: boolean
  /** ISO-8601. Editable from the metadata panel. */
  publishedAt: string
  /** `null` while the page has never been published. */
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  /** When non-null the row is soft-deleted. */
  deletedAt: string | null
  authorId: string | null
  authorName: string | null
  /** Approved comment count for this page's metric row. */
  commentCount: number
  /** The page's `metric.public_id` UUID — used by the admin comment-count link. */
  commentPublicId: string
}

export interface AdminPageDetailDto {
  page: AdminPageDto
  /** Latest revision (draft preferred over published). */
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

export interface ListPagesInput {
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
  /** Published state filter. */
  published?: boolean
  /** Filter by author. */
  authorId?: string
  /** Zero-based offset for pagination. */
  offset?: number
  /** Page size; capped server-side. */
  limit?: number
}

export interface ListPagesOutput {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

export interface GetPageInput {
  /** Stringified bigint id (admin DTO field). */
  id: string
}

export type GetPageOutput = AdminPageDetailDto | null

export interface ListPageRevisionsInput {
  id: string
}

export interface ListPageRevisionsOutput {
  revisions: AdminRevisionDto[]
}

// `id` absent → create a new row. Present → update the matching row.
// `slug` is wire-optional: when omitted, the server derives one from `title`.
export interface UpsertPageMetaInput {
  id?: string
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  /** Toggle the「修改于 XXXX」secondary timestamp on the public detail page. */
  showUpdated?: boolean
  /** Toggle the page-bottom friends grid. */
  showFriends?: boolean
  /** ISO-8601 string; admin date-picker sets this on a re-publish. */
  publishedAt?: string
}

export interface UpsertPageMetaOutput {
  page: AdminPageDto
}

// Single source of truth for the editor/sidebar metadata draft shape.
export interface PageMetaDraft {
  slug: string
  title: string
  summary: string
  cover: string
  og: string
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  showFriends: boolean
  /** `<input type="datetime-local">` value (no timezone). Empty = leave server publishedAt alone. */
  publishedAt: string
}

export const EMPTY_PAGE_META_DRAFT: PageMetaDraft = {
  slug: '',
  title: '',
  summary: '',
  cover: '',
  og: '',
  published: false,
  commentsEnabled: true,
  showToc: false,
  showUpdated: false,
  showFriends: false,
  publishedAt: '',
}

export function pageMetaDraftsEqual(a: PageMetaDraft, b: PageMetaDraft): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.summary === b.summary &&
    a.cover === b.cover &&
    a.og === b.og &&
    a.published === b.published &&
    a.commentsEnabled === b.commentsEnabled &&
    a.showToc === b.showToc &&
    a.showUpdated === b.showUpdated &&
    a.showFriends === b.showFriends &&
    a.publishedAt === b.publishedAt
  )
}

export type PageMetaToggleKey = 'commentsEnabled' | 'showToc' | 'showUpdated' | 'showFriends'

export interface PageMetaToggleField {
  key: PageMetaToggleKey
  id: string
  label: string
  description: string
}

export const PAGE_META_TOGGLE_FIELDS: ReadonlyArray<PageMetaToggleField> = [
  {
    key: 'commentsEnabled',
    id: 'page-comments',
    label: '开启评论',
    description: '关闭后页面底部不再渲染评论区。',
  },
  {
    key: 'showToc',
    id: 'page-toc',
    label: '显示目录',
    description: '启用后右侧会渲染基于二级标题的 TOC。',
  },
  {
    key: 'showUpdated',
    id: 'page-show-updated',
    label: '显示修改时间',
    description: '启用后页面正文上方会展示「修改于 XXXX」，否则只展示首次发布时间。',
  },
  {
    key: 'showFriends',
    id: 'page-friends',
    label: '开启友链',
    description: '启用后页面正文末尾会追加全站友链网格。',
  },
]

export interface DeletePageInput {
  id: string
}

export interface DeletePageOutput {
  success: boolean
}

export interface RestorePageInput {
  id: string
}

export interface RestorePageOutput {
  success: boolean
}

// `unpublishPage` flips `meta.published` to false without touching
// the latest published revision (so re-publishing later promotes the
// existing content instead of writing an empty no-op revision).
export interface UnpublishPageInput {
  id: string
}

export interface UnpublishPageOutput {
  page: AdminPageDto
}

export interface SavePageBodyInput {
  id: string
  /** PortableText body. Validated by the server perimeter. */
  body: PortableTextBody
  /** Optimistic-concurrency token. */
  expectedClientRevisionToken?: string | null
  /** Override the conflict guard. */
  force?: boolean
  /** Optional ISO-8601 publish target. */
  publishedAt?: string
}

export type SavePageBodyOutput =
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      expectedToken: string
    }

export interface PreviewPageBodyInput {
  body: PortableTextBody
}

export interface PreviewPageBodyOutput {
  /** Rendered HTML for the preview pane. */
  html: string
  headings: MarkdownHeading[]
}

export interface RenderMathInput {
  /** Raw TeX source. Length-bounded by `renderMathSchema`. */
  tex: string
  /** `true` for `$$ … $$` block math; `false` for inline `$ … $`. */
  display: boolean
}

export interface RenderMathOutput {
  /** KaTeX-rendered MathML, or an empty string when KaTeX threw. */
  mathml: string
  /** Server-side error message when KaTeX refused to render the input. */
  error: string | null
}

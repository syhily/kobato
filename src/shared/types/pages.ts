import type { AdminPageDetailDto, AdminPageDto } from '@/shared/contracts/pages'
import type { PortableTextBody } from '@/shared/pt/schema'

// Wire-format DTOs for the `/admin/pages` editor and the
// `/api/admin/list-pages` oRPC procedure. Bigints are stringified;
// row DTOs are zod-derived in `@/shared/contracts/pages`.

export interface ListPagesInput {
  q?: string
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: string
  /** Zero-based. */
  offset?: number
  /** Capped server-side. */
  limit?: number
}

export interface GetPageInput {
  /** Stringified bigint id (admin DTO field). */
  id: string
}

export type GetPageOutput = AdminPageDetailDto | null

export interface ListPageRevisionsInput {
  id: string
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
  webmentionsEnabled?: boolean
  showToc?: boolean
  /** Toggle the "Updated on XXXX" secondary timestamp on the public detail page. */
  showUpdated?: boolean
  /** Toggle the page-bottom friends grid. */
  showFriends?: boolean
  /** ISO-8601 string; admin date-picker sets this on a re-publish. `null` cancels a pending schedule. */
  publishedAt?: string | null
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
  webmentionsEnabled: boolean
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
  webmentionsEnabled: true,
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
    a.webmentionsEnabled === b.webmentionsEnabled &&
    a.showToc === b.showToc &&
    a.showUpdated === b.showUpdated &&
    a.showFriends === b.showFriends &&
    a.publishedAt === b.publishedAt
  )
}

export type PageMetaToggleKey = 'commentsEnabled' | 'webmentionsEnabled' | 'showToc' | 'showUpdated' | 'showFriends'

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
    key: 'webmentionsEnabled',
    id: 'page-webmentions',
    label: '显示 Webmention',
    description: '关闭后页面底部不再渲染「引用与回应」区块（全局开关关闭时亦不渲染）。',
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

// Flips `meta.published` to false without touching the latest published
// revision (re-publishing later promotes the existing content).
export interface UnpublishPageInput {
  id: string
}

export interface UnpublishPageOutput {
  page: AdminPageDto
}

export interface PreviewPageBodyInput {
  body: PortableTextBody
}

export interface RenderMathInput {
  /** Length-bounded by `renderMathSchema`. */
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

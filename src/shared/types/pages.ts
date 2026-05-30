import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/types/catalog'

// Wire-format DTOs and request shapes for the `/admin/pages` editor +
// the `/api/admin/list-pages` oRPC procedure. Lives in
// `@/shared` so server (admin actions, service layer) and client
// (admin UI fetcher hooks) import the same shape without crossing the
// server/client boundary. Bigints are stringified — the public site
// never ships ids; the admin shell uses them as React list keys and
// echoes them back unchanged.

// --- Page metadata wire DTO ------------------------------------------------

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
  /**
   * Render the「修改于 XXXX」secondary timestamp on the public detail
   * page next to the first-publish date. Toggled from the meta sidebar
   * next to the TOC toggle; defaults `false` so most pages stay single-date.
   */
  showUpdated: boolean
  /**
   * Render the global friends grid at the bottom of the page detail
   * route. Toggled from the editor's metadata sidebar; the grid is
   * **not** part of the body (the PortableText dialect has no
   * friends block), so flipping this on/off does not require
   * re-publishing the body.
   */
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
  /**
   * Approved comment count for this page's metric row. Populated by the
   * admin list endpoint; `0` on detail / save paths.
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

export interface AdminRevisionDto {
  id: string
  revisionNo: number
  status: 'draft' | 'published'
  body: PortableTextBody
  /**
   * Storage paths captured at save time so the storage-GC pass can
   * tell which images each revision still references without
   * re-parsing the body.
   */
  imageSources: string[]
  headings: MarkdownHeading[]
  /** User id of whoever saved this revision. */
  authorId: string | null
  /** Optimistic-concurrency token; client must echo on next save. */
  clientRevisionToken: string
  createdAt: string
  updatedAt: string
}

export interface AdminPageDetailDto {
  page: AdminPageDto
  /** Latest revision (draft preferred over published). */
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

// --- list / get -----------------------------------------------------------

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

// --- create / update meta -------------------------------------------------

// `id` absent → create a new row. Present → update the matching row.
// All optional fields fall back to defaults on create or to existing
// values on update.
//
// `slug` is wire-optional: when omitted (or empty), the server derives
// one from `title` via `deriveSlug` (pinyin-pro -> github-slugger),
// matching the tag and category flows.
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
  /**
   * Toggle the「修改于 XXXX」secondary timestamp on the public detail page.
   * See `AdminPageDto.showUpdated`. Defaults to `false` on create.
   */
  showUpdated?: boolean
  /**
   * Toggle the page-bottom friends grid. See `AdminPageDto.showFriends`
   * for the full semantics. Defaults to `false` on create.
   */
  showFriends?: boolean
  /** ISO-8601 string; admin date-picker sets this on a re-publish. */
  publishedAt?: string
}

export interface UpsertPageMetaOutput {
  page: AdminPageDto
}

// Single source of truth for the editor/sidebar metadata draft shape.
// `MetaSidebar` and the create-flow local draft both consume this type;
// adding a meta field touches exactly this declaration plus the
// `EMPTY_PAGE_META_DRAFT` / `pageMetaDraftFromDto` helpers below.
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

// Field metadata for the 展示选项 card in `MetaSidebar`. Pure data — the
// component maps over this array to render rows. Adding a toggle is
// (1) extend `PageMetaDraft` / `EMPTY_PAGE_META_DRAFT` / `pageMetaDraftsEqual`
// (2) add a row here. Schema / DB / projection layers stay in their own files.
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

// --- delete / restore -----------------------------------------------------

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
// existing content instead of writing an empty no-op revision). The
// public catalog 404s the page while it's unpublished.
export interface UnpublishPageInput {
  id: string
}

export interface UnpublishPageOutput {
  page: AdminPageDto
}

// --- save / publish -------------------------------------------------------

// Save a draft body or publish it atomically. The wire shape is
// identical between the two endpoints — the difference lives in the
// HTTP route and what the server does after the row write.
export interface SavePageBodyInput {
  id: string
  /** PortableText body. Validated by the server perimeter. */
  body: PortableTextBody
  /**
   * Optimistic-concurrency token. When provided and the server's
   * latest revision token differs, the server returns a `conflict`
   * response without writing.
   */
  expectedClientRevisionToken?: string | null
  /** Override the conflict guard. Used by the conflict-resolution UI. */
  force?: boolean
  /**
   * Optional ISO-8601 publish target. Honoured only by
   * `publishLatest`. Omit (or send a past timestamp) to publish
   * immediately; send a future timestamp to schedule the page —
   * the public catalog hides scheduled pages until their
   * `publishedAt` arrives.
   */
  publishedAt?: string
}

export type SavePageBodyOutput =
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      expectedToken: string
    }

// --- preview --------------------------------------------------------------

// Thin SSR-side render preview. The editor right pane swaps into this
// without saving. Server validates the body but does not persist it.
export interface PreviewPageBodyInput {
  body: PortableTextBody
}

export interface PreviewPageBodyOutput {
  /** Rendered HTML for the preview pane. */
  html: string
  headings: MarkdownHeading[]
}

// --- math (editor preview) ------------------------------------------------

// Editor inline-math preview. The bubble menu's "行内 TeX" panel POSTs
// the typing buffer here on every keystroke (debounced) and renders
// whatever MathML comes back. Going through the same KaTeX renderer the
// prerender pass uses guarantees the preview cannot drift from what
// the published page will show on save.
export interface RenderMathInput {
  /** Raw TeX source. Length-bounded by `renderMathSchema`. */
  tex: string
  /**
   * `true` for `$$ … $$` block math; `false` for inline `$ … $`.
   * Mirrors the display flag passed to the prerenderer per block /
   * mark def.
   */
  display: boolean
}

export interface RenderMathOutput {
  /**
   * KaTeX-rendered MathML, or an empty string when KaTeX threw.
   * The editor surfaces the empty case as an inline syntax-error
   * badge while continuing to show the last successful render so
   * the preview pane never flashes blank mid-typing.
   */
  mathml: string
  /**
   * Server-side error message when KaTeX refused to render the
   * input (typically a TeX syntax error). `null` on success. The
   * editor reads this to decide whether to flip the error badge.
   */
  error: string | null
}

// --- mermaid (editor preview) ---------------------------------------------

export interface RenderMermaidInput {
  /** Raw Mermaid diagram source. Length-bounded by `renderMermaidSchema`. */
  code: string
}

export interface RenderMermaidOutput {
  svg: string
  error: string | null
}

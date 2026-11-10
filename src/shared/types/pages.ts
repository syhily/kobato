import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { AdminPageDetailDto, AdminPageDto } from '@/shared/contracts/pages'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

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
  /**
   * Author-declared BCP 47 language of the prose (any well-formed tag).
   * `null` clears it; omitted leaves the stored value untouched.
   */
  contentLanguage?: string | null
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
  contentLanguage: string
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
  contentLanguage: '',
  showFriends: false,
  publishedAt: '',
}

// Keys derive from `EMPTY_PAGE_META_DRAFT` so a new draft field joins the
// equality check automatically. The cast is sound: the empty draft is a
// complete `PageMetaDraft`, so its runtime keys are exactly `keyof PageMetaDraft`.
const PAGE_META_DRAFT_KEYS = unsafeCast<Array<keyof PageMetaDraft>>(Object.keys(EMPTY_PAGE_META_DRAFT))

export function pageMetaDraftsEqual(a: PageMetaDraft, b: PageMetaDraft): boolean {
  return PAGE_META_DRAFT_KEYS.every((key) => a[key] === b[key])
}

export type PageMetaToggleKey = 'commentsEnabled' | 'webmentionsEnabled' | 'showToc' | 'showUpdated' | 'showFriends'

export interface PageMetaToggleField {
  key: PageMetaToggleKey
  id: string
  /** UI message ids — `ToggleOptionsCard` resolves them with the active locale. */
  labelId: UiMessageId
  descriptionId: UiMessageId
}

export const PAGE_META_TOGGLE_FIELDS: ReadonlyArray<PageMetaToggleField> = [
  {
    key: 'commentsEnabled',
    id: 'page-comments',
    labelId: 'admin.editor.toggle.page.comments.label',
    descriptionId: 'admin.editor.toggle.page.comments.description',
  },
  {
    key: 'webmentionsEnabled',
    id: 'page-webmentions',
    labelId: 'admin.editor.toggle.page.webmentions.label',
    descriptionId: 'admin.editor.toggle.page.webmentions.description',
  },
  {
    key: 'showToc',
    id: 'page-toc',
    labelId: 'admin.editor.toggle.page.toc.label',
    descriptionId: 'admin.editor.toggle.page.toc.description',
  },
  {
    key: 'showUpdated',
    id: 'page-show-updated',
    labelId: 'admin.editor.toggle.page.updated.label',
    descriptionId: 'admin.editor.toggle.page.updated.description',
  },
  {
    key: 'showFriends',
    id: 'page-friends',
    labelId: 'admin.editor.toggle.page.friends.label',
    descriptionId: 'admin.editor.toggle.page.friends.description',
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
  body: LexicalEditorState
}

export interface RenderMathInput {
  /** Length-bounded by the `admin.renders.math` input schema. */
  tex: string
  /** `true` for `$$ … $$` block math; `false` for inline `$ … $`. */
  display: boolean
}

export interface RenderMathOutput {
  /** KaTeX-rendered MathML, or an empty string when KaTeX threw. */
  mathml: string
  /**
   * Failure descriptor: `admin.editor.math.renderFailed` for the non-Error
   * fallback, `error.api.rawMessage` carrying KaTeX's own technical text.
   * The client's render-math adapter resolves it with the active locale.
   */
  error: ErrorMessageDescriptor | null
}

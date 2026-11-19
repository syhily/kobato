import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

// The page editor's metadata model: the sidebar metadata draft and the
// toggle-field registry. The `admin.pages.upsert-meta` wire shapes are
// zod-derived in `@kobato/contracts/pages` — import them there, never here.

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

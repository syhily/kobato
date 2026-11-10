import type { AdminPostDetailDto, AdminPostDto } from '@/shared/contracts/posts'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The row DTOs (`AdminPostDto`, `AdminPostDetailDto`, list/revision
// outputs) are zod-derived in `@/shared/contracts/posts`.

export interface ListPostsInput {
  q?: string
  deletedStatus?: 'all' | 'deleted' | 'normal'
  offset?: number
  limit?: number
  categoryId?: string
  tag?: string
  published?: boolean
  visible?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  authorId?: string
}

export interface GetPostInput {
  id: string
}

export type GetPostOutput = AdminPostDetailDto | null

export interface ListPostRevisionsInput {
  id: string
}

export interface UpsertPostMetaInput {
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
  /** Toggle the「修改于 XXXX」secondary timestamp; defaults `false` on create. */
  showUpdated?: boolean
  /**
   * Author-declared BCP 47 language of the prose (any well-formed tag).
   * `null` clears it; omitted leaves the stored value untouched.
   */
  contentLanguage?: string | null
  visible?: boolean
  /** ISO to set; `null` cancels a pending schedule; omitted = leave untouched. */
  publishedAt?: string | null
  categoryId?: string | null
  tags?: string[]
  alias?: string[]
  pinnedAt?: string | null
}

export interface UpsertPostMetaOutput {
  post: AdminPostDto
}

// Single source of truth for the editor/sidebar metadata draft shape.
export interface PostMetaDraft {
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
  /** Empty string = unset (renders no `lang`); the server canonicalizes valid tags. */
  contentLanguage: string
  visible: boolean
  pinned: boolean
  categoryId: string
  tags: string[]
  alias: string[]
  /** `<input type="datetime-local">` value (no timezone). Empty = leave server publishedAt alone. */
  publishedAt: string
}

export const EMPTY_POST_META_DRAFT: PostMetaDraft = {
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
  visible: true,
  pinned: false,
  categoryId: '',
  tags: [],
  alias: [],
  publishedAt: '',
}

// Keys derive from `EMPTY_POST_META_DRAFT` so a new draft field joins the
// equality check automatically. The cast is sound: the empty draft is a
// complete `PostMetaDraft`, so its runtime keys are exactly `keyof PostMetaDraft`.
const POST_META_DRAFT_KEYS = unsafeCast<Array<keyof PostMetaDraft>>(Object.keys(EMPTY_POST_META_DRAFT))

export function postMetaDraftsEqual(a: PostMetaDraft, b: PostMetaDraft): boolean {
  return POST_META_DRAFT_KEYS.every((key) => {
    const av = a[key]
    const bv = b[key]
    // Array fields (tags/alias) compare element-wise via JSON; the rest are primitives.
    return Array.isArray(av) && Array.isArray(bv) ? JSON.stringify(av) === JSON.stringify(bv) : av === bv
  })
}

export interface DeletePostInput {
  id: string
}

export interface DeletePostOutput {
  success: true
}

export interface RestorePostInput {
  id: string
}

export interface RestorePostOutput {
  success: true
}

export interface UnpublishPostInput {
  id: string
}

export interface UnpublishPostOutput {
  post: AdminPostDto
}

export interface PreviewPostBodyInput {
  body: LexicalEditorState
}

export type PostMetaToggleKey =
  | 'commentsEnabled'
  | 'webmentionsEnabled'
  | 'showToc'
  | 'showUpdated'
  | 'visible'
  | 'pinned'

export interface PostMetaToggleField {
  key: PostMetaToggleKey
  id: string
  /** UI message ids — `ToggleOptionsCard` resolves them with the active locale. */
  labelId: UiMessageId
  descriptionId: UiMessageId
  /** When set, the toggle is only rendered if the feature flag is enabled. */
  featureGate?: 'featurePosts'
}

export const POST_META_TOGGLE_FIELDS: ReadonlyArray<PostMetaToggleField> = [
  {
    key: 'commentsEnabled',
    id: 'post-comments',
    labelId: 'admin.editor.toggle.post.comments.label',
    descriptionId: 'admin.editor.toggle.post.comments.description',
  },
  {
    key: 'webmentionsEnabled',
    id: 'post-webmentions',
    labelId: 'admin.editor.toggle.post.webmentions.label',
    descriptionId: 'admin.editor.toggle.post.webmentions.description',
  },
  {
    key: 'showToc',
    id: 'post-toc',
    labelId: 'admin.editor.toggle.post.toc.label',
    descriptionId: 'admin.editor.toggle.post.toc.description',
  },
  {
    key: 'showUpdated',
    id: 'post-show-updated',
    labelId: 'admin.editor.toggle.post.updated.label',
    descriptionId: 'admin.editor.toggle.post.updated.description',
  },
  {
    key: 'visible',
    id: 'post-visible',
    labelId: 'admin.editor.toggle.post.visible.label',
    descriptionId: 'admin.editor.toggle.post.visible.description',
  },
  {
    key: 'pinned',
    id: 'post-pinned',
    labelId: 'admin.editor.toggle.post.pinned.label',
    descriptionId: 'admin.editor.toggle.post.pinned.description',
    featureGate: 'featurePosts',
  },
]

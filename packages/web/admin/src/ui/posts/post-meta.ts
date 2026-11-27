import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
  contentLanguage: string
  visible: boolean
  pinned: boolean
  categoryId: string
  tags: string[]
  alias: string[]
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

const POST_META_DRAFT_KEYS = unsafeCast<Array<keyof PostMetaDraft>>(Object.keys(EMPTY_POST_META_DRAFT))

export function postMetaDraftsEqual(a: PostMetaDraft, b: PostMetaDraft): boolean {
  return POST_META_DRAFT_KEYS.every((key) => {
    const av = a[key]
    const bv = b[key]
    return Array.isArray(av) && Array.isArray(bv) ? JSON.stringify(av) === JSON.stringify(bv) : av === bv
  })
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
  labelId: UiMessageId
  descriptionId: UiMessageId
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

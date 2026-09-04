import type { AdminPostDetailDto, AdminPostDto } from '@/shared/contracts/posts'
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
  visible: true,
  pinned: false,
  categoryId: '',
  tags: [],
  alias: [],
  publishedAt: '',
}

// Keys derive from `EMPTY_POST_META_DRAFT` so a new `PostMetaDraft` field
// joins the equality check automatically instead of silently desyncing.
// Safe cast: the empty draft is a complete `PostMetaDraft`, so its runtime
// keys are exactly `keyof PostMetaDraft`.
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
  label: string
  description: string
  /** When set, the toggle is only rendered if the feature flag is enabled. */
  featureGate?: 'featurePosts'
}

export const POST_META_TOGGLE_FIELDS: ReadonlyArray<PostMetaToggleField> = [
  {
    key: 'commentsEnabled',
    id: 'post-comments',
    label: '开启评论',
    description: '关闭后文章底部不再渲染评论区。',
  },
  {
    key: 'webmentionsEnabled',
    id: 'post-webmentions',
    label: '显示 Webmention',
    description: '关闭后文章底部不再渲染「引用与回应」区块（全局开关关闭时亦不渲染）。',
  },
  {
    key: 'showToc',
    id: 'post-toc',
    label: '显示目录',
    description: '启用后右侧会渲染基于二级标题的 TOC。',
  },
  {
    key: 'showUpdated',
    id: 'post-show-updated',
    label: '显示修改时间',
    description: '启用后文章正文上方会展示「修改于 XXXX」，否则只展示首次发布时间。',
  },
  {
    key: 'visible',
    id: 'post-visible',
    label: '文章可见',
    description: '关闭后文章不在首页和随机文章组件中展示，但仍可通过链接访问。',
  },
  {
    key: 'pinned',
    id: 'post-pinned',
    label: '置顶到首页',
    description: '置顶的文章会出现在首页精选区，最多展示 3 篇。',
    featureGate: 'featurePosts',
  },
]

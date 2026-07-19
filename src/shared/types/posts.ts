import type { PortableTextBody } from '@/shared/pt/schema'
import type { AdminRevisionDto } from '@/shared/types/revision'
import type { MarkdownHeading } from '@/shared/utils/toc'

export interface AdminPostDto {
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
   * Opt the post into rendering「修改于 XXXX」next to the first-publish
   * date on the public detail page. Toggled from the editor meta sidebar
   * (next to the TOC toggle); defaults `false`.
   */
  showUpdated: boolean
  visible: boolean
  publishedAt: string
  publishedRevisionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  category: string
  categoryId: string | null
  tags: string[]
  alias: string[]
  authorId: string | null
  authorName: string | null
  pinnedAt: string | null
  /** Null until the first successful publish. */
  firstPublishedAt: string | null
  /**
   * Approved comment count for this post's metric row. Populated by
   * the admin list endpoint; `0` on detail / save paths.
   */
  commentCount: number
  /**
   * The post's `metric.public_id` UUID — the opaque wire identifier the
   * admin comment-count link uses to deep-link into
   * `/admin/comments?pageKey=<uuid>`. Empty string on detail / save
   * paths that don't fan out a metric upsert.
   */
  commentPublicId: string
}

export interface AdminPostDetailDto {
  post: AdminPostDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

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

export interface ListPostsOutput {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

export interface GetPostInput {
  id: string
}

export type GetPostOutput = AdminPostDetailDto | null

export interface ListPostRevisionsInput {
  id: string
}

export interface ListPostRevisionsOutput {
  revisions: AdminRevisionDto[]
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
  showToc?: boolean
  /**
   * Toggle the「修改于 XXXX」secondary timestamp on the public detail
   * page. Defaults `false` on create.
   */
  showUpdated?: boolean
  visible?: boolean
  publishedAt?: string
  categoryId?: string | null
  tags?: string[]
  alias?: string[]
  pinnedAt?: string | null
}

export interface UpsertPostMetaOutput {
  post: AdminPostDto
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
  body: PortableTextBody
}

export interface PreviewPostBodyOutput {
  html: string
  headings: MarkdownHeading[]
}

export type PostMetaToggleKey = 'commentsEnabled' | 'showToc' | 'showUpdated' | 'visible' | 'pinned'

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

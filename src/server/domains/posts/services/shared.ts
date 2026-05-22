import type { AdminPostDto, CmsPost } from '@/server/domains/posts/projection'
import type { PostMetaRow } from '@/server/infra/db/types'

import { canEditPost, type ViewerContext as RbacViewerContext } from '@/server/domains/auth/rbac'
import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug'

export type ViewerContext = RbacViewerContext

export interface AdminPostsListResult {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

export interface UpsertPostMetaInput {
  id?: bigint
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  showUpdated?: boolean
  visible?: boolean
  pinnedAt?: Date | null
  category?: string
  tags?: string[]
  alias?: string[]
  publishedAt?: Date
}

export interface SavePostBodyInput {
  postId: bigint
  body: unknown
  expectedClientRevisionToken?: string | null
  force?: boolean
  authorId: bigint | null
  publishedAt?: Date
}

export type SavePostResult =
  | { status: 'saved'; revision: import('@/server/domains/posts/projection').AdminRevisionDto }
  | {
      status: 'conflict'
      latest: import('@/server/domains/posts/projection').AdminRevisionDto
      expectedToken: string
    }

export function assertOwnPostOr404(meta: PostMetaRow | null, viewer?: ViewerContext): asserts meta is PostMetaRow {
  if (!meta) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (viewer && !canEditPost(viewer, meta)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
}

const RESERVED_POST_SLUGS = new Set<string>([
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

const SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export function ensureSlugLegal(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new DomainError('BAD_REQUEST', '文章 slug 格式不合法（仅允许小写字母、数字、`-` `_` `.`）。')
  }
  if (slug.length > 80) {
    throw new DomainError('BAD_REQUEST', '文章 slug 长度不得超过 80 个字符。')
  }
  if (RESERVED_POST_SLUGS.has(slug)) {
    throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`)
  }
}

export function resolveSlugForPost(explicit: string | undefined, title: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim()
  }
  const derived = deriveSlug(title)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从标题推导出 slug，请手动填写。', [
      { message: '标题推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}

// Process-level cache for catalog post metas. Cleared on admin writes.
const postMetaCache = createRedisCache<CmsPost[]>('posts:catalog:metas', { ttlMs: 10_000 })

export async function clearPostMetasCache(): Promise<void> {
  await postMetaCache.clear()
}

export { postMetaCache }

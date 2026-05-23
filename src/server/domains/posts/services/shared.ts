import type { AdminPostDto, AdminRevisionDto, CmsPost } from '@/server/domains/posts/projection'
import type { PostMetaRow } from '@/server/infra/db/types'

import { canEditPost, type ViewerContext as RbacViewerContext } from '@/server/domains/auth/rbac'
import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'

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
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
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

// Process-level cache for catalog post metas. Cleared on admin writes.
// Blog catalog data changes infrequently (only on admin writes).
// 5-minute TTL balances freshness with DB load.
const postMetaCache = createRedisCache<CmsPost[]>('posts:catalog:metas', { ttlMs: 300_000 })

export async function clearPostMetasCache(): Promise<void> {
  await postMetaCache.clear()
}

export { postMetaCache }

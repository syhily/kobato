import type { AdminPostDto } from '@/server/domains/posts/projection'
import type { PostMetaRow } from '@/server/infra/db/types'

import { canEditPost, type ViewerContext as RbacViewerContext } from '@/server/domains/auth/rbac'
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

export function assertOwnPostOr404(meta: PostMetaRow | null, viewer?: ViewerContext): asserts meta is PostMetaRow {
  if (!meta) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (viewer && !canEditPost(viewer, meta)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
}

import type { UpsertMetaInputBase } from '@/server/domains/content/entities/descriptor'
import type { AdminPostDto } from '@/server/domains/posts/projection'
import type { PostMetaRow } from '@/server/infra/db/types'

import { canEditPost, type ViewerIdentity } from '@/server/domains/auth/rbac'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'

export interface AdminPostsListResult {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

// Server-side write shape (number ids / Dates) — distinct from the wire
// `UpsertPostMetaInput` in `@/shared/types/posts` (string ids / ISO dates).
export interface PostMetaWriteInput extends UpsertMetaInputBase {
  visible?: boolean
  pinnedAt?: Date | null
  categoryId?: number | null
  tags?: string[]
  alias?: string[]
}

export function assertOwnPostOr404(meta: PostMetaRow | null, viewer?: ViewerIdentity): asserts meta is PostMetaRow {
  if (!meta) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (viewer && !canEditPost(viewer, meta)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
}

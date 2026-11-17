import type { AdminPostDto } from '@kobato/shared/contracts/posts.ts'

import type { PostMetaRow } from '../../../infra/db/types'
import type { UpsertMetaInputBase } from '../../content/entities/descriptor'

import { DomainError, ErrorMessages } from '../../../infra/http/errors'
import { canEditPost, type ViewerIdentity } from '../../auth/rbac'

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

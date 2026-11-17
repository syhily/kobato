import type { AdminPostDto } from '@kobato/contracts/posts.ts'
import type { PostMetaRow } from '@kobato/db/types.ts'
import type { UpsertMetaInputBase } from '@kobato/server/domains/content/entities/descriptor.ts'

import { canEditPost, type ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors.ts'

export interface AdminPostsListResult {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

// Server-side write shape (number ids / Dates) — distinct from the wire
// upsert-meta input (string ids / ISO dates).
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

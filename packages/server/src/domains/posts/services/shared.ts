import type { AdminPostDto } from '@kobato/api/contracts/posts'
import type { PostMetaRow } from '@kobato/db/types'
import type { UpsertMetaInputBase } from '@kobato/server/domains/content/entities/descriptor'

import { canEditPost, type ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'

export interface AdminPostsListResult {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

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

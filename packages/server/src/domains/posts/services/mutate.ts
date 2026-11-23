import type { AdminPostDto } from '@kobato/api/contracts/admin/posts'
import type { Database } from '@kobato/db/sqlite/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { PostMetaWriteInput } from '@kobato/server/domains/posts/services/shared'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

const mutations = makeEntityMutations(postDescriptor)

export const createPost = mutations.create
export const deletePost = mutations.remove
export const restorePost = mutations.restore
export const unpublishPost = mutations.unpublish

export async function updatePostMeta(
  db: Database,
  input: PostMetaWriteInput,
  viewer?: ViewerIdentity,
): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  return mutations.update(db, { ...input, id: input.id }, viewer)
}

import type { Database } from '@kobato/db/database.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'
import type { PostMetaWriteInput } from '@kobato/server/domains/posts/services/shared.ts'
import type { AdminPostDto } from '@kobato/shared/contracts/posts.ts'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate.ts'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

// The five mutations come from the shared descriptor-driven skeleton;
// everything post-specific attaches through `postDescriptor`.
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

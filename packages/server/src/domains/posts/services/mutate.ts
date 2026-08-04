import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { AdminPostDto } from '@kobato/server/domains/posts/projection'
import type { UpsertPostMetaInput } from '@kobato/server/domains/posts/services/shared'
import type { Database } from '@kobato/server/infra/db/database'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

// The five meta mutations come from the shared descriptor-driven skeleton
// (`content/entities/mutate.ts`); everything post-specific (RBAC, tags,
// category, search index) attaches through `postDescriptor`.
const mutations = makeEntityMutations(postDescriptor)

export const createPost = mutations.create
export const deletePost = mutations.remove
export const restorePost = mutations.restore
export const unpublishPost = mutations.unpublish

export async function updatePostMeta(
  db: Database,
  input: UpsertPostMetaInput,
  viewer?: ViewerIdentity,
): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  return mutations.update(db, { ...input, id: input.id }, viewer)
}

import type { AdminPageDto } from '@kobato/server/domains/pages/projection'
import type { UpsertPageMetaInput } from '@kobato/server/domains/pages/services/shared'
import type { Database } from '@kobato/server/infra/db/database'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

// The five meta mutations come from the shared descriptor-driven skeleton
// (`content/entities/mutate.ts`); page behavior attaches through
// `pageDescriptor`.
const mutations = makeEntityMutations(pageDescriptor)

export const createPage = mutations.create
export const deletePage = mutations.remove
export const restorePage = mutations.restore
export const unpublishPage = mutations.unpublish

export async function updatePageMeta(db: Database, input: UpsertPageMetaInput): Promise<AdminPageDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePageMeta requires an id')
  }
  return mutations.update(db, { ...input, id: input.id })
}

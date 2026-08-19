import type { AdminPageDto } from '@/server/domains/pages/projection'
import type { PageMetaWriteInput } from '@/server/domains/pages/services/shared'
import type { Database } from '@/server/infra/db/database'

import { makeEntityMutations } from '@/server/domains/content/entities/mutate'
import { pageDescriptor } from '@/server/domains/pages/descriptor'
import { DomainError } from '@/server/infra/http/errors'

// The five meta mutations come from the shared descriptor-driven skeleton via `pageDescriptor`.
const mutations = makeEntityMutations(pageDescriptor)

export const createPage = mutations.create
export const deletePage = mutations.remove
export const restorePage = mutations.restore
export const unpublishPage = mutations.unpublish

export async function updatePageMeta(db: Database, input: PageMetaWriteInput): Promise<AdminPageDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePageMeta requires an id')
  }
  return mutations.update(db, { ...input, id: input.id })
}

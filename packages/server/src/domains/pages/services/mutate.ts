import type { AdminPageDto } from '@kobato/contracts/pages'
import type { Database } from '@kobato/db/database'
import type { PageMetaWriteInput } from '@kobato/server/domains/pages/services/shared'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

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

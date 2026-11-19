import type { AdminPageDto } from '@kobato/contracts/pages.ts'
import type { Database } from '@kobato/db/database.ts'
import type { PageMetaWriteInput } from '@kobato/server/domains/pages/services/shared.ts'

import { makeEntityMutations } from '@kobato/server/domains/content/entities/mutate.ts'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

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

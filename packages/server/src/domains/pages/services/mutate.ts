import type { AdminPageDto } from '@kobato/shared/contracts/pages.ts'

import type { Database } from '../../../infra/db/database'
import type { PageMetaWriteInput } from './shared'

import { DomainError } from '../../../infra/http/errors'
import { makeEntityMutations } from '../../content/entities/mutate'
import { pageDescriptor } from '../descriptor'

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

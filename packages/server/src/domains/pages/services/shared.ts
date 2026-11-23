import type { PageMetaRow } from '@kobato/db/sqlite/types'
import type { UpsertMetaInputBase } from '@kobato/server/domains/content/entities/descriptor'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export interface PageMetaWriteInput extends UpsertMetaInputBase {
  showFriends?: boolean
}

export function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('content.error.entityNotFound', { entity: 'page' }))
  }
}

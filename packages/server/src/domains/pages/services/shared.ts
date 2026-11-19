import type { PageMetaRow } from '@kobato/db/types.ts'
import type { UpsertMetaInputBase } from '@kobato/server/domains/content/entities/descriptor.ts'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

export interface PageMetaWriteInput extends UpsertMetaInputBase {
  showFriends?: boolean
}

export function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('content.error.entityNotFound', { entity: 'page' }))
  }
}

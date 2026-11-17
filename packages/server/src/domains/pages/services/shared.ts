import type { PageMetaRow } from '@kobato/db/types.ts'
import type { UpsertMetaInputBase } from '@kobato/server/domains/content/entities/descriptor.ts'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

// Server-side write shape (number ids / Dates) — distinct from the wire
// upsert-meta input (string ids / ISO dates).
export interface PageMetaWriteInput extends UpsertMetaInputBase {
  showFriends?: boolean
}

/**
 * Existence-only access gate — pages are admin-only, so no ownership check.
 */
export function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('content.error.entityNotFound', { entity: 'page' }))
  }
}

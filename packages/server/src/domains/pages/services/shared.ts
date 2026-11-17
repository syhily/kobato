import type { PageMetaRow } from '../../../infra/db/types'
import type { UpsertMetaInputBase } from '../../content/entities/descriptor'

import { descriptorFor } from '../../../infra/http/error-descriptor'
import { DomainError } from '../../../infra/http/errors'

// Server-side write shape (number ids / Dates) — distinct from the wire
// `UpsertPageMetaInput` in `@/shared/types/pages` (string ids / ISO dates).
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

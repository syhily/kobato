import type { UpsertMetaInputBase } from '@/server/domains/content/entities/descriptor'
import type { PageMetaRow } from '@/server/infra/db/types'

import { DomainError } from '@/server/infra/http/errors'

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
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
}

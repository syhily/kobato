import type { UpsertMetaInputBase } from '@/server/domains/content/entities/descriptor'
import type { PageMetaRow } from '@/server/infra/db/types'

import { DomainError } from '@/server/infra/http/errors'

/**
 * Page upsert input: the shared meta fields (see `UpsertMetaInputBase`)
 * plus the page-only friends-widget flag.
 */
export interface UpsertPageMetaInput extends UpsertMetaInputBase {
  showFriends?: boolean
}

/**
 * The page access gate: existence only (pages are an admin-only
 * surface, so there is no ownership rule to evaluate — the post
 * counterpart `assertOwnPostOr404` additionally checks `canEditPost`).
 */
export function assertPageExists(meta: PageMetaRow | null): asserts meta is PageMetaRow {
  if (meta === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
}

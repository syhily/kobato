import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Shared status-filter projection for the admin list filter pills: maps a
// status option onto the list API's `deletedStatus` flag plus the
// caller-owned legs. Each caller passes its own leg map — posts include
// the `visible` leg, pages do not (the page table has no `visible`
// column), so the maps stay caller-owned while the deleted/normal split
// lives here exactly once.

export type StatusQueryFields<F extends Record<string, unknown>> = {
  deletedStatus: 'all' | 'deleted' | 'normal'
} & Partial<F>

export function deriveStatusQueryFields<S extends string, F extends Record<string, unknown>>(
  status: S | 'deleted',
  statusMap: Record<S, F>,
): StatusQueryFields<F> {
  if (status === 'deleted') {
    return unsafeCast<StatusQueryFields<F>>({ deletedStatus: 'deleted' })
  }
  return { deletedStatus: 'normal', ...statusMap[unsafeCast<S>(status)] }
}

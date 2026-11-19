import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

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

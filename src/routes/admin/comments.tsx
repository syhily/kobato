import { useOutletContext, useSearchParams } from 'react-router'

import type { ActiveFilter } from '@/ui/admin/comments/useCommentsController'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { CommentsView } from '@/ui/admin/comments/CommentsView'
import { isTextFilterOperator, textFilterLabel } from '@/ui/admin/comments/useCommentsController'
import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  isSingleDateFilterOperator,
  singleDateFilterLabel,
} from '@/ui/admin/shared/date-filter'

import type { Route } from './+types/comments'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export const meta = titleMeta('评论管理')

// Build the initial filter list from a `URLSearchParams` snapshot.
// Exported so the route's filter-restore logic is unit-testable
// without standing up a router. Mirrors the URL shape written by
// `CommentsView` (and intentionally lenient — invalid values fall
// back to a sensible default rather than throwing, so a hand-edited
// URL never bricks the page).
export function parseCommentFiltersFromSearchParams(searchParams: URLSearchParams): ActiveFilter[] {
  const initialFilters: ActiveFilter[] = []

  const status = searchParams.get('status')
  if (status && status !== 'all') {
    const statusLabel: Record<string, string> = {
      pending: '待审核',
      approved: '已审核',
      deleteRequested: '申请删除',
    }
    initialFilters.push({ field: 'status', value: status, label: statusLabel[status] ?? status })
  }

  const pageKey = searchParams.get('pageKey')
  if (pageKey) {
    initialFilters.push({ field: 'page', value: pageKey, label: pageKey })
  }

  const userId = searchParams.get('userId')
  if (userId) {
    initialFilters.push({ field: 'author', value: userId, label: userId })
  }

  const q = searchParams.get('q')
  const matchRaw = searchParams.get('match')
  if (q) {
    const op = isTextFilterOperator(matchRaw) ? matchRaw : 'contains'
    const value = JSON.stringify({ value: q, op })
    initialFilters.push({ field: 'text', value, label: textFilterLabel({ value: q, op }) })
  }

  const date = searchParams.get('date')
  const dateOp = searchParams.get('dateOp')
  if (date && isSingleDateFilterOperator(dateOp)) {
    const value = JSON.stringify({ date, op: dateOp })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op: dateOp }) })
  } else if (date) {
    // Partial date URL — fall back to the default operator so the
    // chip stays consistent with the picker, which always pairs a
    // date with an operator. `dateOp` may be missing or invalid;
    // `DEFAULT_SINGLE_DATE_OPERATOR` matches Ghost's "on or before" default.
    const op = isSingleDateFilterOperator(dateOp) ? dateOp : DEFAULT_SINGLE_DATE_OPERATOR
    const value = JSON.stringify({ date, op })
    initialFilters.push({ field: 'date', value, label: singleDateFilterLabel({ date, op }) })
  }

  return initialFilters
}

export default function WpAdminCommentsRoute() {
  const { currentUser } = useOutletContext<{
    currentUser: { id: string; name: string; email: string }
  }>()
  const [searchParams] = useSearchParams()

  const initialFilters = parseCommentFiltersFromSearchParams(searchParams)

  return (
    <CommentsView
      currentUserName={currentUser.name}
      currentUserEmail={currentUser.email}
      initialFilters={initialFilters}
    />
  )
}

import { useOutletContext, useSearchParams } from 'react-router'

import type { ActiveFilter } from '@/ui/admin/comments/useCommentsController'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { CommentsView } from '@/ui/admin/comments/CommentsView'

import type { Route } from './+types/comments'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '评论管理' }, bundleFromMatches(matches))
}

export default function WpAdminCommentsRoute() {
  const { currentUser } = useOutletContext<{
    currentUser: { id: string; name: string; email: string }
  }>()
  const [searchParams] = useSearchParams()

  const initialFilters: ActiveFilter[] = []

  const status = searchParams.get('status')
  if (status && status !== 'all') {
    const label = status === 'pending' ? '待审核' : '已审核'
    initialFilters.push({ field: 'status', value: status, label })
  }

  const pageKey = searchParams.get('pageKey')
  if (pageKey) {
    initialFilters.push({ field: 'page', value: pageKey, label: pageKey })
  }

  const userId = searchParams.get('userId')
  if (userId) {
    initialFilters.push({ field: 'author', value: userId, label: userId })
  }

  return (
    <CommentsView
      currentUserName={currentUser.name}
      currentUserEmail={currentUser.email}
      initialFilters={initialFilters}
    />
  )
}

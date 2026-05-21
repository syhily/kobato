import { useOutletContext, useSearchParams } from 'react-router'

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
  return (
    <CommentsView
      currentUserName={currentUser.name}
      currentUserEmail={currentUser.email}
      initialAuthorId={searchParams.get('userId') ?? undefined}
      initialPageKey={searchParams.get('pageKey') ?? undefined}
      initialStatus={(searchParams.get('status') as 'all' | 'pending' | 'approved') ?? undefined}
    />
  )
}

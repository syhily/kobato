import { useNavigate, useParams } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { UserDetailView } from '@/ui/admin/users/UserDetailView'

import type { Route } from './+types/detail'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '用户详情' }, bundleFromMatches(matches))
}

export default function WpAdminUserDetailRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <UserDetailView userId={id ?? ''} navigate={navigate} />
}

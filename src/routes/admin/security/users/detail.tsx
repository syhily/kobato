import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { UserDetailView } from '@/ui/admin/users/UserDetailView'

import type { Route } from './+types/detail'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return { passkeyEnabled: isPasskeyEnabled() }
}

export const meta = titleMeta('用户详情')

export default function WpAdminUserDetailRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <UserDetailView userId={params.id ?? ''} navigate={navigate} passkeyEnabled={loaderData.passkeyEnabled} />
}

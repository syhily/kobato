import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate'
import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { UserDetailView } from '@kobato/ui/admin/users/UserDetailView'
import { useNavigate, useOutletContext } from 'react-router'

import type { Route } from './+types/detail'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return { passkeyEnabled: isPasskeyEnabled() }
}

export const meta = titleMeta('用户详情')

export default function WpAdminUserDetailRoute({ loaderData, params }: Route.ComponentProps) {
  const navigate = useNavigate()
  const { currentUser } = useOutletContext<{ currentUser: { id: string; name: string; email: string } }>()
  return (
    <UserDetailView
      userId={params.id ?? ''}
      currentUserId={currentUser.id}
      navigate={navigate}
      passkeyEnabled={loaderData.passkeyEnabled}
    />
  )
}

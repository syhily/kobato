import { orpc } from '@kobato/api/browser/client'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { UserDetailView } from '@kobato/web-admin/ui/users/UserDetailView'
import { useNavigate, useOutletContext } from 'react-router'

import type { Route } from './+types/detail'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  return { passkeyEnabled: await orpc.admin.users.passkeyFlag() }
}

export const meta = titleMeta('meta.title.admin.userDetail')

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

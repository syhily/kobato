import { orpc } from '@kobato/api/browser/client'
import { useNavigate, useOutletContext } from 'react-router'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { UserDetailView } from '@/ui/users/UserDetailView'

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

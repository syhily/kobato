import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { UserDetailView } from '@kobato/web-admin/ui/users/UserDetailView.tsx'
import { useNavigate, useOutletContext } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

import type { Route } from './+types/detail'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'admin')
  return { passkeyEnabled: await caller.admin.users.passkeyFlag() }
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

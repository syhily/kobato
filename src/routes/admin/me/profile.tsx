import { data } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { MyProfileView } from '@/ui/admin/my/MyProfileView'

import type { Route } from './+types/profile'

export const meta = titleMeta('个人信息')

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  // Any logged-in role can edit their own row; admin.layout already rejects anonymous visitors.
  requireRole(viewer ?? undefined, 'visitor')
  const [profile, myCounts] = await Promise.all([caller.account.profile(), caller.comments.myCounts()])
  return data({
    user: profile.user,
    counts: myCounts,
    passkeyEnabled: profile.passkeyEnabled,
    mailReady: profile.mailReady,
  })
}

export default function WpAdminMyProfileRoute({ loaderData }: Route.ComponentProps) {
  return (
    <MyProfileView
      user={loaderData.user}
      counts={loaderData.counts}
      passkeyEnabled={loaderData.passkeyEnabled}
      mailReady={loaderData.mailReady}
    />
  )
}

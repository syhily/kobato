import { requireRole } from '@kobato/server/domains/auth/rbac'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { MyProfileView } from '@kobato/web-admin/ui/account/MyProfileView'
import { data } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/profile'

export const meta = titleMeta('meta.title.admin.profile')

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
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

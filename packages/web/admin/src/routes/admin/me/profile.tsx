import { orpc } from '@kobato/api/browser/client'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { MyProfileView } from '@kobato/web-admin/ui/account/MyProfileView'
import { data } from 'react-router'

import type { Route } from './+types/profile'

export const meta = titleMeta('meta.title.admin.profile')

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'visitor', { pathname: new URL(request.url).pathname })
  const [profile, myCounts] = await Promise.all([orpc.account.profile(), orpc.account.comments.myCounts()])
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

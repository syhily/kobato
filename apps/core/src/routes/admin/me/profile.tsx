import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate'
import { requireRole } from '@kobato/server/domains/auth/rbac'
import { isMailLoginReady } from '@kobato/server/domains/auth/services/shared'
import { countMyComments } from '@kobato/server/domains/comments/services/mine-comments'
import { getAccountProfile } from '@kobato/server/domains/users/services/account'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { idFromString } from '@kobato/shared/utils/id'
import { MyProfileView } from '@kobato/ui/admin/my/MyProfileView'
import { data } from 'react-router'

import type { Route } from './+types/profile'

export const meta = titleMeta('个人信息')

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const ctx = { user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // Self-service: any logged-in role can edit their own row. admin.layout
  // already rejects anonymous visitors; this keeps the contract explicit.
  requireRole(ctx, 'visitor')
  const userId = idFromString(ctx.user.id)
  const [profile, counts] = await Promise.all([getAccountProfile(rc.db, userId), countMyComments(rc.db, userId)])
  return data({
    user: profile,
    counts,
    passkeyEnabled: isPasskeyEnabled(),
    mailReady: isMailLoginReady(),
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

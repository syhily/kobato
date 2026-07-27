import { data } from 'react-router'

import { isPasskeyEnabled } from '@/server/domains/auth/passkey/gate'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments } from '@/server/domains/comments/services/mine-comments'
import { getAccountProfile } from '@/server/domains/users/services/account'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { MyProfileView } from '@/ui/admin/my/MyProfileView'

import type { Route } from './+types/profile'

export const meta = titleMeta('个人信息')

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const ctx = { user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }
  // Self-service: any logged-in role can edit their own row. admin.layout
  // already rejects anonymous visitors; this keeps the contract explicit.
  requireRole(ctx, 'visitor')
  const userId = BigInt(ctx.user.id)
  const [profile, counts] = await Promise.all([getAccountProfile(rc.db, userId), countMyComments(rc.db, userId)])
  return data({
    user: profile,
    counts,
    passkeyEnabled: isPasskeyEnabled(),
  })
}

export default function WpAdminMyProfileRoute({ loaderData }: Route.ComponentProps) {
  return <MyProfileView user={loaderData.user} counts={loaderData.counts} passkeyEnabled={loaderData.passkeyEnabled} />
}

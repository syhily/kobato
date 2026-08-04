import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { WebmentionsView } from '@kobato/ui/admin/webmentions/WebmentionsView'

import type { Route } from './+types/webmentions'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('Webmention 管理')

export default function WpAdminWebmentionsRoute() {
  return <WebmentionsView />
}

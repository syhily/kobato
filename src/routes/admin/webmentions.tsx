import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { WebmentionOutboxView } from '@/ui/admin/webmentions/WebmentionOutboxView'

import type { Route } from './+types/webmentions'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('Webmention 发送日志')

export default function WpAdminWebmentionsRoute() {
  return <WebmentionOutboxView />
}

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { ApiKeysView } from '@kobato/ui/admin/apikeys/ApiKeysView'

import type { Route } from './+types/keys'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')
  return null
}

export const meta = titleMeta('前端密钥')

export default function WpAdminApiKeysRoute() {
  return <ApiKeysView />
}

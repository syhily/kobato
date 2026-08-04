import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { MusicsView } from '@kobato/ui/admin/musics/MusicsView'

import type { Route } from './+types/music'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'author')
  return null
}

export const meta = titleMeta('音乐管理')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}

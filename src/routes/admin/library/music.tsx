import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { MusicsView } from '@/ui/admin/musics/MusicsView'

import type { Route } from './+types/music'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('音乐管理')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}

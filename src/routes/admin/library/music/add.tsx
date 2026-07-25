import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'

import type { Route } from './+types/add'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('添加音乐')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'

import type { Route } from './+types/add'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '添加音乐' }, bundleFromMatches(matches))
}

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}

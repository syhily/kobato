import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'

import type { Route } from './+types/detail'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return { id: params.id }
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '歌曲详情' }, bundleFromMatches(matches))
}

export default function AdminMusicDetailRoute() {
  return <MusicDetailView />
}

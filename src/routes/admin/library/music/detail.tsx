import { useNavigate } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'

import type { Route } from './+types/detail'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return { id: params.id }
}

export const meta = titleMeta('歌曲详情')

export default function AdminMusicDetailRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <MusicDetailView id={params.id ?? ''} navigate={navigate} />
}

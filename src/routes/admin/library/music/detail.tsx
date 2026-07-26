import { useNavigate } from 'react-router'

import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'

import type { Route } from './+types/detail'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'author')
  return { id: params.id }
}

export const meta = titleMeta('歌曲详情')

export default function AdminMusicDetailRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <MusicDetailView id={params.id ?? ''} navigate={navigate} />
}

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { MusicDetailView } from '@kobato/web-admin/ui/music/MusicDetailView'
import { useNavigate } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/detail'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole(rc.viewer ?? undefined, 'author')
  return { id: params.id }
}

export const meta = titleMeta('meta.title.admin.musicDetail')

export default function AdminMusicDetailRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <MusicDetailView id={params.id ?? ''} navigate={navigate} />
}

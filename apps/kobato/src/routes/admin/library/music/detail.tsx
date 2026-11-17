import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { getRequestContext } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { MusicDetailView } from '@kobato/web/ui/admin/musics/MusicDetailView.tsx'
import { useNavigate } from 'react-router'

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

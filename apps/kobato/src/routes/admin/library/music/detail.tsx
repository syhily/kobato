import { useNavigate } from 'react-router'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { MusicDetailView } from '@/ui/music/MusicDetailView'

import type { Route } from './+types/detail'

export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'author', { pathname: new URL(request.url).pathname })
  return { id: params.id }
}

export const meta = titleMeta('meta.title.admin.musicDetail')

export default function AdminMusicDetailRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <MusicDetailView id={params.id ?? ''} navigate={navigate} />
}

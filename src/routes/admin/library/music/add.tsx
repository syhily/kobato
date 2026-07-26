import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'

import type { Route } from './+types/add'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'author')
  return null
}

export const meta = titleMeta('添加音乐')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}

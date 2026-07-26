import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { ImagesView } from '@/ui/admin/images/ImagesView'

import type { Route } from './+types/images'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'author')
  return null
}

export const meta = titleMeta('图片管理')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}

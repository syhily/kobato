import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { titleMeta } from '@/shared/seo/title-meta'
import { ImagesView } from '@/ui/admin/images/ImagesView'

import type { Route } from './+types/images'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'author')
  return null
}

export const meta = titleMeta('图片管理')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}

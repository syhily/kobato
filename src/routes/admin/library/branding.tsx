import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { projectAssetsForAdmin } from '@/shared/config/projection'
import { titleMeta } from '@/shared/seo/title-meta'
import { BrandingView } from '@/ui/admin/library/BrandingView'

import type { Route } from './+types/branding'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'admin')
  const bundle = getBlogSettingsBundleSync()
  if (!bundle?.assets) {
    return { branding: null }
  }
  const projected = projectAssetsForAdmin(bundle.assets)
  return { branding: projected.branding }
}

export const meta = titleMeta('品牌素材')

export default function WpAdminBrandingRoute({ loaderData }: Route.ComponentProps) {
  return <BrandingView branding={loaderData.branding} />
}

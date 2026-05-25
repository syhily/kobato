import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { projectAssetsForAdmin } from '@/shared/config/projection'
import { BrandingView } from '@/ui/admin/library/BrandingView'

import type { Route } from './+types/branding'

export async function loader({ request, context }: Route.LoaderArgs) {
  requireRole(getRouteRequestContext({ request, context }), 'admin')
  const bundle = getBlogSettingsBundleSync()
  if (!bundle?.assets) {
    return { branding: null, storageEnabled: false }
  }
  const projected = projectAssetsForAdmin(bundle.assets)
  return { branding: projected.branding, storageEnabled: projected.storage.enabled }
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '品牌素材' }, bundleFromMatches(matches))
}

export default function WpAdminBrandingRoute({ loaderData }: Route.ComponentProps) {
  return <BrandingView branding={loaderData.branding} storageEnabled={loaderData.storageEnabled} />
}

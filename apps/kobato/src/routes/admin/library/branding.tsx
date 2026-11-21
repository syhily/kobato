import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { projectAssetsForAdmin } from '@kobato/settings/projection'
import { BrandingView } from '@kobato/web-admin/ui/branding/BrandingView'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/branding'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole(rc.viewer ?? undefined, 'admin')
  const bundle = getBlogSettingsBundleSync()
  if (!bundle?.assets) {
    return { branding: null }
  }
  const projected = projectAssetsForAdmin(bundle.assets)
  return { branding: projected.branding }
}

export const meta = titleMeta('meta.title.admin.branding')

export default function WpAdminBrandingRoute({ loaderData }: Route.ComponentProps) {
  return <BrandingView branding={loaderData.branding} />
}

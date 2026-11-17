import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { getRequestContext } from '@kobato/server/http/request-context.ts'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters.ts'
import { projectAssetsForAdmin } from '@kobato/shared/config/projection.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { BrandingView } from '@kobato/web/ui/admin/library/BrandingView.tsx'

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

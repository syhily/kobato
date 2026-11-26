import { projectAssetsForAdmin } from '@kobato/settings/projection'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { BrandingView } from '@/ui/branding/BrandingView'

import type { Route } from './+types/branding'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  const bundle = boot.blogSettings
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

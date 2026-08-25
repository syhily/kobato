import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { projectAssetsForAdmin } from '@/shared/config/projection'
import { titleMeta } from '@/shared/seo/title-meta'
import { StorageView } from '@/ui/admin/library/StorageView'

import type { Route } from './+types/storage'

// Storage backend config + migration management. Lives outside the settings
// autosave framework: the S3 config is locked once enabled and every backend
// switch runs through the migration task (`admin.storage.*`).
export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole(rc.viewer ?? undefined, 'admin')
  const bundle = getBlogSettingsBundleSync()
  if (!bundle?.assets) {
    return { assets: null }
  }
  // The projection derives the secret mask from the (server-side, decrypted) bundle itself.
  return { assets: projectAssetsForAdmin(bundle.assets) }
}

export const meta = titleMeta('存储管理')

export default function AdminLibraryStorageRoute({ loaderData }: Route.ComponentProps) {
  return <StorageView assets={loaderData.assets} />
}

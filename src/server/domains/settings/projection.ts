import type { AssetsLoaderShape, SearchLoaderShape } from '@/shared/config/projection'
import type { AssetsSettings, SearchSettings } from '@/shared/config/types'

import { projectAssetsForAdmin, projectSearchForAdmin } from '@/shared/config/projection'

export { projectAssetsForAdmin, projectSearchForAdmin }

/**
 * @deprecated Use `projectAssetsForAdmin` from `@/shared/config/settings` directly.
 * Re-exported here for backwards compatibility with existing server imports.
 */
export function projectAssetsForAdminLegacy(assets: AssetsSettings): AssetsLoaderShape {
  return projectAssetsForAdmin(assets)
}

/**
 * @deprecated Use `projectSearchForAdmin` from `@/shared/config/settings` directly.
 * Re-exported here for backwards compatibility with existing server imports.
 */
export function projectSearchForAdminLegacy(search: SearchSettings | undefined): SearchLoaderShape {
  return projectSearchForAdmin(search)
}

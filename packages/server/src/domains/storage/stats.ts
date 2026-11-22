import type { Database } from '@kobato/db/database'

import { countLocalStorageObjects } from '@kobato/db/operations/storage'
import { BRANDING_SLOTS } from '@kobato/server/domains/assets/services/storage'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export interface MigrationStats {
  images: number
  music: number
  branding: number
  backups: number
}

export async function getLocalStorageMigrationStats(db: Database): Promise<MigrationStats> {
  const local = await countLocalStorageObjects(db)

  let branding = 0
  const brandingSettings = getBlogSettingsBundleSync()?.assets?.branding
  if (brandingSettings !== undefined) {
    for (const slot of BRANDING_SLOTS) {
      const ref = brandingSettings[unsafeCast<keyof typeof brandingSettings>(slot)]
      if (ref !== undefined && typeof ref === 'object' && ref.driver === 'local') {
        branding += 1
      }
    }
  }

  return { images: local.images, music: local.music, branding, backups: local.backups }
}

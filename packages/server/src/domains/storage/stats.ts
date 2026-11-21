import type { Database } from '@kobato/db/database'

import { backup as backupTable } from '@kobato/db/schema/backup'
import { image, music } from '@kobato/db/schema/media'
import { BRANDING_SLOTS } from '@kobato/server/domains/assets/services/storage'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, eq, isNull } from 'drizzle-orm'

export interface MigrationStats {
  images: number
  music: number
  branding: number
  backups: number
}

export async function getLocalStorageMigrationStats(db: Database): Promise<MigrationStats> {
  const localImages = await db
    .select({ path: image.storagePath })
    .from(image)
    .where(and(eq(image.storageDriver, 'local'), isNull(image.deletedAt)))
  const localMusic = await db
    .select({ id: music.id })
    .from(music)
    .where(and(eq(music.storageDriver, 'local'), isNull(music.deletedAt)))
  const localBackups = await db
    .select({ id: backupTable.id })
    .from(backupTable)
    .where(eq(backupTable.storageDriver, 'local'))

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

  return { images: localImages.length, music: localMusic.length, branding, backups: localBackups.length }
}

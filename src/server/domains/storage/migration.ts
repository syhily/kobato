import { and, eq, isNull } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { BrandingObjectRef } from '@/shared/config/types'

import {
  BRANDING_SLOTS,
  legacyKeyForSlot,
  SLOT_CONTENT_TYPE,
  s3KeyForSlot,
} from '@/server/domains/assets/services/storage'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { image, music } from '@/server/infra/db/schema/media'
import { getLogger } from '@/server/infra/logger'
import { backendFor } from '@/server/infra/storage/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('storage.migration')

// Both backends come from the registry, not direct adapter imports.
const localBackend = backendFor('local')
const s3Backend = backendFor('s3')

/** Best-effort local cleanup after a copy — never rejects (ENOENT is fine). */
const deleteLocalSafe = (key: string): Promise<void> =>
  localBackend.delete(key).catch((error) => {
    log.debug('Local cleanup after migration failed', { key, error: String(error) })
  })

export interface MigrationStats {
  images: number
  music: number
  branding: number
  backups: number
}

export interface MigrationResult extends MigrationStats {
  skipped: number
  failed: number
}

/** Count local-driver assets of each type — drives the migration card + run summary. */
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

/**
 * Copy every local-stored asset to S3 and flip its recorded driver; per-item
 * errors are counted, never fatal. Precondition: S3 configured (oRPC enforces).
 */
export async function migrateLocalToS3(db: Database): Promise<MigrationResult> {
  const result: MigrationResult = { images: 0, music: 0, branding: 0, backups: 0, skipped: 0, failed: 0 }

  const localImages = await db
    .select({ path: image.storagePath, mime: image.mimeType })
    .from(image)
    .where(and(eq(image.storageDriver, 'local'), isNull(image.deletedAt)))
  for (const row of localImages) {
    try {
      // Driver flip + local cleanup run even when the object pre-existed in S3.
      let alreadyInS3 = false
      if (await s3Backend.exists(row.path)) {
        alreadyInS3 = true
      } else {
        const body = await localBackend.get(row.path)
        await s3Backend.put({ key: row.path, body, contentType: row.mime, visibility: 'public' })
      }
      await db.update(image).set({ storageDriver: 's3' }).where(eq(image.storagePath, row.path))
      await invalidateImageEnhanceCacheFor(db, row.path)
      await deleteLocalSafe(row.path)
      if (alreadyInS3) {
        result.skipped += 1
      } else {
        result.images += 1
      }
    } catch (error) {
      result.failed += 1
      log.error('Image migration failed', { key: row.path, error: String(error) })
    }
  }

  const localMusic = await db
    .select({ id: music.id, audio: music.audioStoragePath, cover: music.coverStoragePath })
    .from(music)
    .where(and(eq(music.storageDriver, 'local'), isNull(music.deletedAt)))
  for (const row of localMusic) {
    try {
      // Count `skipped` only when both audio and cover pre-existed in S3.
      let uploadedAny = false
      for (const [key, mime] of [
        [row.audio, 'audio/mpeg'],
        [row.cover, 'image/jpeg'],
      ] as const) {
        if (await s3Backend.exists(key)) {
          continue
        }
        const body = await localBackend.get(key)
        await s3Backend.put({ key, body, contentType: mime, visibility: 'public' })
        await deleteLocalSafe(key)
        uploadedAny = true
      }
      await db.update(music).set({ storageDriver: 's3' }).where(eq(music.id, row.id))
      if (uploadedAny) {
        result.music += 1
      } else {
        result.skipped += 1
      }
    } catch (error) {
      result.failed += 1
      log.error('Music migration failed', { id: String(row.id), error: String(error) })
    }
  }

  await migrateBranding(db, result)

  const localBackups = await db
    .select({ id: backupTable.id, path: backupTable.storagePath })
    .from(backupTable)
    .where(eq(backupTable.storageDriver, 'local'))
  for (const row of localBackups) {
    try {
      let alreadyInS3 = false
      if (await s3Backend.exists(row.path)) {
        alreadyInS3 = true
      } else {
        await s3Backend.putStream({
          key: row.path,
          body: await localBackend.getStream(row.path),
          contentType: 'application/gzip',
          visibility: 'private',
        })
      }
      await db.update(backupTable).set({ storageDriver: 's3' }).where(eq(backupTable.id, row.id))
      await deleteLocalSafe(row.path)
      if (alreadyInS3) {
        result.skipped += 1
      } else {
        result.backups += 1
      }
    } catch (error) {
      result.failed += 1
      log.error('Backup migration failed', { key: row.path, error: String(error) })
    }
  }

  log.info('Local→S3 migration completed', { ...result })
  return result
}

/** Copy every local-driver branding slot to S3 and flip the persisted ref. */
async function migrateBranding(db: Database, result: MigrationResult): Promise<void> {
  const existing = findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  if (existing === null) {
    return
  }
  const data = { ...unsafeCast<Record<string, unknown>>(existing.data) }
  const branding = { ...unsafeCast<Record<string, BrandingObjectRef | undefined>>(data.branding) }

  let changed = false
  for (const slot of BRANDING_SLOTS) {
    const ref = branding[slot]
    if (ref === undefined || ref.driver !== 'local') {
      continue
    }
    const key = s3KeyForSlot(slot)
    const legacyKey = legacyKeyForSlot(slot)
    try {
      const alreadyInS3 = await s3Backend.exists(key)
      if (!alreadyInS3) {
        let body: Buffer
        if (await localBackend.exists(key)) {
          body = await localBackend.get(key)
        } else if (await localBackend.exists(legacyKey)) {
          body = await localBackend.get(legacyKey)
        } else {
          // Orphaned ref: flip the driver anyway so it stops counting as local.
          branding[slot] = { ...ref, driver: 's3' }
          changed = true
          result.skipped += 1
          continue
        }
        await s3Backend.put({ key, body, contentType: SLOT_CONTENT_TYPE[slot], visibility: 'private' })
      }
      branding[slot] = { ...ref, driver: 's3' }
      await deleteLocalSafe(key)
      await deleteLocalSafe(legacyKey)
      if (alreadyInS3) {
        result.skipped += 1
      } else {
        result.branding += 1
      }
      changed = true
    } catch (error) {
      result.failed += 1
      log.error('Branding migration failed', { slot, error: String(error) })
    }
  }

  if (changed) {
    data.branding = branding
    upsertSetting(db, data, null, SECTION_REGISTRY.assets.scope)
    await refreshBlogSettings(db)
  }
}

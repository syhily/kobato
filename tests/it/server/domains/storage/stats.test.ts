import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BlogSettingsBundle, BrandingObjectRef } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getLocalStorageMigrationStats } from '@/server/domains/storage/stats'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { image, music } from '@/server/infra/db/schema/media'

// Stats read real rows + the settings snapshot.
const db = getTestDb()

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

let rowCounter = 0
function nextRowId(): number {
  rowCounter += 1
  return rowCounter
}

async function seedImage(overrides: Partial<typeof image.$inferInsert> = {}) {
  const n = nextRowId()
  const rows = await db
    .insert(image)
    .values({
      storagePath: `images/stats-${n}.jpg`,
      storageDriver: 'local',
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      byteSize: 4096,
      ...overrides,
    })
    .returning()
  return rows[0]
}

async function seedMusic(overrides: Partial<typeof music.$inferInsert> = {}) {
  const n = nextRowId()
  const rows = await db
    .insert(music)
    .values({
      source: 'netease',
      sourceId: `source-${n}`,
      playerId: `player-${n}`,
      name: 'Track',
      artist: 'Artist',
      album: 'Album',
      audioStoragePath: `musics/stats-${n}.mp3`,
      coverStoragePath: `musics/stats-${n}.jpg`,
      storageDriver: 'local',
      ...overrides,
    })
    .returning()
  return rows[0]
}

async function seedBackup(overrides: Partial<typeof backupTable.$inferInsert> = {}) {
  const n = nextRowId()
  const rows = await db
    .insert(backupTable)
    .values({
      timestamp: `2026-07-15T00-00-${String(n).padStart(2, '0')}`,
      storagePath: `backup/stats-${n}.sql.gz`,
      storageDriver: 'local',
      byteSize: 8192,
      ...overrides,
    })
    .returning()
  return rows[0]
}

function brandingRef(driver: 's3' | 'local'): BrandingObjectRef {
  return {
    etag: `etag-${driver}`,
    contentType: 'image/svg+xml',
    size: 512,
    updatedAt: new Date().toISOString(),
    driver,
  }
}

describe('storage/stats — getLocalStorageMigrationStats', () => {
  it('counts only live local rows per type (soft-deleted rows excluded)', async () => {
    await seedImage() // local, live
    await seedImage() // local, live
    await seedImage({ deletedAt: new Date() }) // local, soft-deleted → excluded
    await seedImage({ storageDriver: 's3' }) // s3 → excluded

    await seedMusic() // local, live
    await seedMusic({ deletedAt: new Date() }) // local, soft-deleted → excluded
    await seedMusic({ storageDriver: 's3' }) // s3 → excluded

    await seedBackup() // local
    await seedBackup() // local
    await seedBackup({ storageDriver: 's3' }) // s3 → excluded

    const stats = await getLocalStorageMigrationStats(db)

    // The default test bundle carries no branding refs → branding stays 0.
    expect(stats).toEqual({ images: 2, music: 1, branding: 0, backups: 2 })
  })

  it('counts only branding slots whose persisted ref is on the local driver', async () => {
    const bundle: BlogSettingsBundle = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        asset: { host: 'assets.example.com', scheme: 'https' },
        storage: {
          enabled: false,
          endpoint: '',
          region: '',
          bucket: '',
          accessKeyId: '',
          secretAccessKey: '',
          forcePathStyle: false,
          urlTemplate: '',
        },
        upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
        branding: {
          faviconSvg: brandingRef('local'),
          logoSvg: brandingRef('local'),
          icon192: brandingRef('s3'),
          // A string config field, not a BrandingObjectRef — never counted.
          robotsTxt: 'User-agent: *',
        },
      },
    }
    setBlogSettingsBundleForTests(bundle)

    const stats = await getLocalStorageMigrationStats(db)

    expect(stats).toEqual({ images: 0, music: 0, branding: 2, backups: 0 })
  })
})

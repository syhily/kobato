import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MemoryBackend } from '#/_helpers/memory-storage'
import type { BlogSettingsBundle, BrandingObjectRef } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { image, music } from '@/server/infra/db/schema/media'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// Both backends are the in-memory seam; `migrateLocalToS3` captures
// backendFor() at module scope, so the seam must be set BEFORE the module
// loads — hence the dynamic import below.
const localMem = makeMemoryBackend({ driver: 'local' })
const s3Mem = makeMemoryBackend()
__setStorageBackendForTests('local', localMem.backend)
__setStorageBackendForTests('s3', s3Mem.backend)

const { getLocalStorageMigrationStats, migrateLocalToS3 } = await import('@/server/domains/storage/migration')

// Stats read real rows + the settings snapshot; migrateLocalToS3 drives the
// injected backends and asserts real row updates.
const db = getTestDb()

beforeEach(async () => {
  // Re-set after the afterEach reset so the registry never points at real adapters.
  __setStorageBackendForTests('local', localMem.backend)
  __setStorageBackendForTests('s3', s3Mem.backend)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  localMem.reset()
  s3Mem.reset()
})

let rowCounter = 0
function nextRowId(): number {
  rowCounter += 1
  return rowCounter
}

/** Place a raw object on a memory backend, bypassing the put tracking. */
function seedObject(target: MemoryBackend, key: string): void {
  target.store.set(key, { body: Buffer.from('x'), contentType: 'application/octet-stream' })
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

describe('storage/migration — getLocalStorageMigrationStats', () => {
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

describe('storage/migration — migrateLocalToS3 counting (no double-count)', () => {
  it('counts music as skipped only when both audio + cover pre-exist in S3', async () => {
    // A: both halves pre-exist → skipped; B: neither → uploaded; C: cover missing → still uploaded.
    const a = await seedMusic({ audioStoragePath: 'musics/a-a.mp3', coverStoragePath: 'musics/a-c.jpg' })
    const b = await seedMusic({ audioStoragePath: 'musics/b-a.mp3', coverStoragePath: 'musics/b-c.jpg' })
    const c = await seedMusic({ audioStoragePath: 'musics/c-a.mp3', coverStoragePath: 'musics/c-c.jpg' })
    for (const key of ['a-a.mp3', 'a-c.jpg', 'b-a.mp3', 'b-c.jpg', 'c-a.mp3', 'c-c.jpg']) {
      seedObject(localMem, `musics/${key}`)
    }
    seedObject(s3Mem, 'musics/a-a.mp3')
    seedObject(s3Mem, 'musics/a-c.jpg')
    seedObject(s3Mem, 'musics/c-a.mp3')

    const result = await migrateLocalToS3(db)

    expect(result.music).toBe(2) // B + C uploaded
    expect(result.skipped).toBe(1) // A only
    expect(result.failed).toBe(0)
    // The three missing halves were PUT; the pre-existing ones were not re-uploaded.
    expect([...s3Mem.putKeys].sort()).toEqual(['musics/b-a.mp3', 'musics/b-c.jpg', 'musics/c-c.jpg'])
    // Every local-driver music row got its driver flipped to s3 — a real row update.
    for (const row of [a, b, c]) {
      const reread = await db.select().from(music).where(eq(music.id, row.id))
      expect(reread[0].storageDriver).toBe('s3')
    }
  })

  it('counts an image as skipped when it pre-exists, migrated otherwise', async () => {
    await seedImage({ storagePath: 'images/old.jpg' })
    await seedImage({ storagePath: 'images/new.jpg' })
    seedObject(localMem, 'images/old.jpg')
    seedObject(localMem, 'images/new.jpg')
    seedObject(s3Mem, 'images/old.jpg')

    const result = await migrateLocalToS3(db)

    expect(result.images).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    // Only the missing image is PUT; the pre-existing one is not re-uploaded.
    expect(s3Mem.putKeys).toEqual(['images/new.jpg'])
    // Both rows flipped — even the skipped one's driver is corrected.
    const rows = await db.select().from(image)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.storageDriver === 's3')).toBe(true)
  })

  it('counts a backup as skipped when it pre-exists, migrated otherwise', async () => {
    const oldBackup = await seedBackup({ storagePath: 'backup/old.sql.gz' })
    const newBackup = await seedBackup({ storagePath: 'backup/new.sql.gz' })
    seedObject(localMem, 'backup/old.sql.gz')
    seedObject(localMem, 'backup/new.sql.gz')
    seedObject(s3Mem, 'backup/old.sql.gz')

    const result = await migrateLocalToS3(db)

    expect(result.backups).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(s3Mem.putKeys).toEqual(['backup/new.sql.gz'])
    for (const row of [oldBackup, newBackup]) {
      const reread = await db.select().from(backupTable).where(eq(backupTable.id, row.id))
      expect(reread[0].storageDriver).toBe('s3')
    }
  })
})

import { eq } from 'drizzle-orm'
import { Readable } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle, BrandingObjectRef } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { getLocalStorageMigrationStats, migrateLocalToS3 } from '@/server/domains/storage/migration'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { image, music } from '@/server/infra/db/schema/media'

// The migration copies objects between the two registered backends; S3 and
// the local disk are true externals, so both are in-memory Maps behind the
// registry seam. `migrateLocalToS3` resolves them via `backendFor(...)` at
// module scope, so this mock must land before the migration module loads.
const storageMock = vi.hoisted(() => {
  const drain = async (body: AsyncIterable<unknown>): Promise<Buffer> => {
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
  }
  const localStore = new Map<string, Buffer>()
  const s3Store = new Map<string, Buffer>()
  const s3PutKeys: string[] = []
  const localBackend = {
    get: async (key: string) => {
      const b = localStore.get(key)
      if (b === undefined) {
        throw new Error(`local mock: object not found: ${key}`)
      }
      return b
    },
    getStream: async (key: string) => {
      const b = localStore.get(key)
      if (b === undefined) {
        throw new Error(`local mock: object not found: ${key}`)
      }
      return Readable.from([b])
    },
    exists: async (key: string) => localStore.has(key),
    delete: async (key: string) => {
      localStore.delete(key)
    },
  }
  const s3Backend = {
    exists: async (key: string) => s3Store.has(key),
    put: async ({ key, body }: { key: string; body: Buffer }) => {
      s3PutKeys.push(key)
      s3Store.set(key, body)
      return { key, size: body.length }
    },
    putStream: async ({ key, body }: { key: string; body: AsyncIterable<unknown> }) => {
      s3PutKeys.push(key)
      const buf = await drain(body)
      s3Store.set(key, buf)
      return { key, size: buf.length }
    },
    delete: async (key: string) => {
      s3Store.delete(key)
    },
    list: async () => [],
  }
  return {
    localStore,
    s3Store,
    s3PutKeys,
    localBackend,
    s3Backend,
    reset: () => {
      localStore.clear()
      s3Store.clear()
      s3PutKeys.length = 0
    },
  }
})

vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: () => ({ backend: storageMock.s3Backend, driver: 's3' }),
  backendFor: (driver: 's3' | 'local') => (driver === 's3' ? storageMock.s3Backend : storageMock.localBackend),
}))

// The stats read real image/music/backup rows through the worker database,
// and the branding count comes from the in-process settings snapshot —
// exactly what the admin migration card and the migration run summary
// display. `migrateLocalToS3` additionally drives the mocked backends above
// and asserts the driver flips as real row updates.
const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  storageMock.reset()
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
    // Track A: both halves already in S3 → skipped (NOT skipped + music).
    // Track B: neither half in S3 → uploaded → music.
    // Track C: audio exists but cover does not → still uploaded → music.
    const a = await seedMusic({ audioStoragePath: 'musics/a-a.mp3', coverStoragePath: 'musics/a-c.jpg' })
    const b = await seedMusic({ audioStoragePath: 'musics/b-a.mp3', coverStoragePath: 'musics/b-c.jpg' })
    const c = await seedMusic({ audioStoragePath: 'musics/c-a.mp3', coverStoragePath: 'musics/c-c.jpg' })
    for (const key of ['a-a.mp3', 'a-c.jpg', 'b-a.mp3', 'b-c.jpg', 'c-a.mp3', 'c-c.jpg']) {
      storageMock.localStore.set(`musics/${key}`, Buffer.from('x'))
    }
    // A's audio+cover exist; B's neither; C's audio exists, cover does not.
    storageMock.s3Store.set('musics/a-a.mp3', Buffer.from('x'))
    storageMock.s3Store.set('musics/a-c.jpg', Buffer.from('x'))
    storageMock.s3Store.set('musics/c-a.mp3', Buffer.from('x'))

    const result = await migrateLocalToS3(db)

    expect(result.music).toBe(2) // B + C uploaded
    expect(result.skipped).toBe(1) // A only
    expect(result.failed).toBe(0)
    // The three missing halves were PUT; the pre-existing ones were not re-uploaded.
    expect([...storageMock.s3PutKeys].sort()).toEqual(['musics/b-a.mp3', 'musics/b-c.jpg', 'musics/c-c.jpg'])
    // Every local-driver music row got its driver flipped to s3 — a real row update.
    for (const row of [a, b, c]) {
      const reread = await db.select().from(music).where(eq(music.id, row.id))
      expect(reread[0].storageDriver).toBe('s3')
    }
  })

  it('counts an image as skipped when it pre-exists, migrated otherwise', async () => {
    await seedImage({ storagePath: 'images/old.jpg' })
    await seedImage({ storagePath: 'images/new.jpg' })
    storageMock.localStore.set('images/old.jpg', Buffer.from('x'))
    storageMock.localStore.set('images/new.jpg', Buffer.from('x'))
    storageMock.s3Store.set('images/old.jpg', Buffer.from('x'))

    const result = await migrateLocalToS3(db)

    expect(result.images).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    // Only the missing image is PUT; the pre-existing one is not re-uploaded.
    expect(storageMock.s3PutKeys).toEqual(['images/new.jpg'])
    // Both rows flipped — even the skipped one's driver is corrected.
    const rows = await db.select().from(image)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.storageDriver === 's3')).toBe(true)
  })

  it('counts a backup as skipped when it pre-exists, migrated otherwise', async () => {
    const oldBackup = await seedBackup({ storagePath: 'backup/old.sql.gz' })
    const newBackup = await seedBackup({ storagePath: 'backup/new.sql.gz' })
    storageMock.localStore.set('backup/old.sql.gz', Buffer.from('x'))
    storageMock.localStore.set('backup/new.sql.gz', Buffer.from('x'))
    storageMock.s3Store.set('backup/old.sql.gz', Buffer.from('x'))

    const result = await migrateLocalToS3(db)

    expect(result.backups).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(storageMock.s3PutKeys).toEqual(['backup/new.sql.gz'])
    for (const row of [oldBackup, newBackup]) {
      const reread = await db.select().from(backupTable).where(eq(backupTable.id, row.id))
      expect(reread[0].storageDriver).toBe('s3')
    }
  })
})

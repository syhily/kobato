import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The migration copies local objects to S3 and flips each row's driver. We
// mock the two backends + the settings/DB helpers so the test exercises only
// the counting logic (the double-count bug lived here) and the driver flips.
const { localGet, s3Exists, s3Put } = vi.hoisted(() => ({
  localGet: vi.fn(),
  s3Exists: vi.fn(),
  s3Put: vi.fn(),
}))

vi.mock('@/server/infra/storage/backends/local', () => ({
  localBackend: { get: localGet, delete: vi.fn().mockResolvedValue(undefined), getStream: vi.fn() },
}))
vi.mock('@/server/infra/storage/backends/s3', () => ({
  s3Backend: {
    exists: s3Exists,
    put: s3Put,
    putStream: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: vi.fn().mockResolvedValue(null),
  upsertSetting: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/server/domains/images/services/cache', () => ({
  invalidateImageEnhanceCacheFor: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/shared/config/getters', () => ({ getBlogSettingsBundleSync: vi.fn().mockReturnValue(undefined) }))

import { migrateLocalToS3 } from '@/server/domains/storage/migration'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { image, music } from '@/server/infra/db/schema/media'

interface FakeTable {
  rows: unknown[]
  updates: unknown[]
}

// Minimal stand-in for the Drizzle chain shapes the migration uses:
// `db.select(...).from(t).where()` → Promise<row[]>,
// `db.update(t).set(...).where()` → Promise<void>.
function makeFakeDb(tables: Map<unknown, FakeTable>): NodePgDatabase {
  return {
    select: () => ({
      from: (t: unknown) => ({
        where: async () => tables.get(t)?.rows ?? [],
      }),
    }),
    update: (t: unknown) => ({
      set: (vals: unknown) => ({
        where: async () => {
          tables.get(t)?.updates.push(vals)
        },
      }),
    }),
  } as unknown as NodePgDatabase
}

describe('storage/migration — counting (no double-count)', () => {
  beforeEach(() => {
    localGet.mockReset()
    s3Exists.mockReset()
    s3Put.mockReset()
    localGet.mockResolvedValue(Buffer.from('x'))
  })

  it('counts music as skipped only when both audio + cover pre-exist in S3', async () => {
    // Track A: both halves already in S3 → skipped (NOT skipped + music).
    // Track B: neither half in S3 → uploaded → music.
    // Track C: audio exists but cover does not → still uploaded → music.
    const tables = new Map<unknown, FakeTable>([
      [image, { rows: [], updates: [] }],
      [
        music,
        {
          rows: [
            { id: 1n, audio: 'musics/a-a.mp3', cover: 'musics/a-c.jpg' },
            { id: 2n, audio: 'musics/b-a.mp3', cover: 'musics/b-c.jpg' },
            { id: 3n, audio: 'musics/c-a.mp3', cover: 'musics/c-c.jpg' },
          ],
          updates: [],
        },
      ],
      [backupTable, { rows: [], updates: [] }],
    ])
    // A's audio+cover exist; B's neither; C's audio exists, cover does not.
    s3Exists.mockImplementation(async (key: string) => key.startsWith('musics/a-') || key === 'musics/c-a.mp3')

    const result = await migrateLocalToS3(makeFakeDb(tables))

    expect(result.music).toBe(2) // B + C uploaded
    expect(result.skipped).toBe(1) // A only
    expect(result.failed).toBe(0)
    // Every local-driver music row got its driver flipped to s3.
    expect(tables.get(music)?.updates).toHaveLength(3)
  })

  it('counts an image as skipped when it pre-exists, migrated otherwise', async () => {
    const tables = new Map<unknown, FakeTable>([
      [
        image,
        {
          rows: [
            { path: 'images/old.jpg', mime: 'image/jpeg' },
            { path: 'images/new.jpg', mime: 'image/jpeg' },
          ],
          updates: [],
        },
      ],
      [music, { rows: [], updates: [] }],
      [backupTable, { rows: [], updates: [] }],
    ])
    s3Exists.mockImplementation(async (key: string) => key === 'images/old.jpg')

    const result = await migrateLocalToS3(makeFakeDb(tables))

    expect(result.images).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    // Only the missing image is PUT; the pre-existing one is not re-uploaded.
    expect(s3Put).toHaveBeenCalledTimes(1)
    expect(s3Put.mock.calls[0]?.[0]).toMatchObject({ key: 'images/new.jpg' })
  })

  it('counts a backup as skipped when it pre-exists, migrated otherwise', async () => {
    const tables = new Map<unknown, FakeTable>([
      [image, { rows: [], updates: [] }],
      [music, { rows: [], updates: [] }],
      [
        backupTable,
        {
          rows: [
            { id: 1n, path: 'backup/old.sql.gz' },
            { id: 2n, path: 'backup/new.sql.gz' },
          ],
          updates: [],
        },
      ],
    ])
    s3Exists.mockImplementation(async (key: string) => key === 'backup/old.sql.gz')

    const result = await migrateLocalToS3(makeFakeDb(tables))

    expect(result.backups).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
  })
})

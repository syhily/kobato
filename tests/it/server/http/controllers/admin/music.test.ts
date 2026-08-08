import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { searchMusic } from '@/server/domains/music/services/search'
import { addMusic } from '@/server/domains/music/services/write/add'
import { adminMusicRouter } from '@/server/http/controllers/admin/music.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { music } from '@/server/infra/db/schema/media'
import { user } from '@/server/infra/db/schema/user'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// list / update / delete run real; only true externals stay mocked:
// search/add (provider network) and the storage registry (in-memory
// backend; seeded rows default to driver 's3').

vi.mock('@/server/domains/music/services/search', () => ({
  searchMusic: vi.fn(),
}))

vi.mock('@/server/domains/music/services/write/add', () => ({
  addMusic: vi.fn(),
}))

const mem = makeMemoryBackend()

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
  vi.clearAllMocks()
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  __resetStorageBackendsForTests()
  mem.reset()
})

let seq = 0

async function seedMusic(overrides: Partial<typeof music.$inferInsert> = {}) {
  const n = ++seq
  const [row] = await db
    .insert(music)
    .values({
      source: 'netease',
      sourceId: `sid-${n}`,
      playerId: `pid-${n}`,
      name: 'Song',
      artist: 'Artist',
      album: 'Album',
      audioStoragePath: `musics/pid-${n}.mp3`,
      coverStoragePath: `musics/pid-${n}.jpg`,
      ...overrides,
    })
    .returning()
  return row
}

// audit_log.actor_id references user.id: any audit-recording actor must be a real row.
async function seedUser(role: 'admin' | 'author', name = 'User'): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name, email: `user-${++seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return row.id
}

const musicStub = {
  id: '1',
  source: 'netease' as const,
  sourceId: '12345',
  playerId: 'abcdef1234567890',
  name: 'Song',
  artist: ['Artist'],
  album: 'Album',
  audioStoragePath: 'musics/abcdef1234567890.mp3',
  audioUrl: 'https://cdn.example.com/musics/abcdef1234567890.mp3',
  coverStoragePath: 'musics/abcdef1234567890.jpg',
  coverUrl: 'https://cdn.example.com/musics/abcdef1234567890.jpg',
  lyric: null,
  uploaderId: '1',
  uploaderName: 'Admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('adminMusicRouter.list', () => {
  it('returns seeded musics, total and hasMore', async () => {
    const seeded = await seedMusic({ name: 'Song' })
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminMusicRouter.list, {}, { context: ctx })
    expect(res.musics).toHaveLength(1)
    expect(res.musics[0]).toMatchObject({
      id: String(seeded.id),
      name: 'Song',
      artist: ['Artist'],
      album: 'Album',
    })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })
})

describe('adminMusicRouter.search', () => {
  it('returns search results', async () => {
    vi.mocked(searchMusic).mockResolvedValueOnce({
      results: [
        {
          source: 'netease' as const,
          sourceId: '12345',
          name: 'Song',
          artist: ['Artist'],
          album: 'Album',
          coverUrl: 'https://cdn.example.com/cover.jpg',
          previewUrl: 'https://cdn.example.com/preview.mp3',
        },
      ],
      hasMore: false,
    })
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminMusicRouter.search, { keyword: 'Song' }, { context: ctx })
    expect(res.results).toHaveLength(1)
    expect(res.results[0]!.name).toBe('Song')
  })
})

describe('adminMusicRouter.add', () => {
  it('returns the added music', async () => {
    vi.mocked(addMusic).mockResolvedValueOnce(musicStub)
    const ctx = makeAuthedCtx({ db })
    const res = await call(adminMusicRouter.add, { source: 'netease', sourceId: '12345' }, { context: ctx })
    expect(res.music.id).toBe('1')
  })
})

describe('adminMusicRouter.update', () => {
  it('returns the updated music and persists the new columns', async () => {
    const admin = await seedUser('admin', 'Admin')
    const seeded = await seedMusic({ name: 'Song', artist: 'Artist' })
    const ctx = makeAuthedCtx({ userId: String(admin), db })
    const res = await call(
      adminMusicRouter.update,
      { id: String(seeded.id), name: 'Updated Song', artist: ['Artist'] },
      { context: ctx },
    )
    expect(res.music.name).toBe('Updated Song')
    expect(res.music.artist).toEqual(['Artist'])
    // Omitted album/lyric fall back to '' and null in the row.
    const [row] = await db.select().from(music).where(eq(music.id, seeded.id))
    expect(row).toMatchObject({ name: 'Updated Song', artist: 'Artist', album: '', lyric: null })

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'music_updated'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('music')
    expect(rows[0]!.resourceId).toBe(String(seeded.id))
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('persists name/artist/album/lyric when the author-uploader edits their own track', async () => {
    const author = await seedUser('author', 'Author')
    const seeded = await seedMusic({ uploaderId: author })
    const ctx = makeAuthedCtx({ userId: String(author), role: 'author', db })
    await call(
      adminMusicRouter.update,
      { id: String(seeded.id), name: 'Updated Song', artist: ['Artist'], album: 'Album', lyric: '[00:00] Hi' },
      { context: ctx },
    )
    const [row] = await db.select().from(music).where(eq(music.id, seeded.id))
    expect(row).toMatchObject({
      name: 'Updated Song',
      artist: 'Artist',
      album: 'Album',
      lyric: '[00:00] Hi',
    })
  })
})

describe('adminMusicRouter.delete', () => {
  it('resolves to undefined, soft-deletes the row and cleans up stored assets', async () => {
    const admin = await seedUser('admin', 'Admin')
    const seeded = await seedMusic()
    mem.store.set(seeded.audioStoragePath, { body: Buffer.from('mp3'), contentType: 'audio/mpeg' })
    mem.store.set(seeded.coverStoragePath, { body: Buffer.from('jpg'), contentType: 'image/jpeg' })

    const ctx = makeAuthedCtx({ userId: String(admin), db })
    const res = await call(adminMusicRouter.delete, { id: String(seeded.id) }, { context: ctx })
    expect(res).toBeUndefined()

    const [row] = await db.select().from(music).where(eq(music.id, seeded.id))
    expect(row!.deletedAt).not.toBeNull()
    expect(mem.deletedKeys).toEqual(expect.arrayContaining([seeded.audioStoragePath, seeded.coverStoragePath]))
    expect(mem.store.has(seeded.audioStoragePath)).toBe(false)
    expect(mem.store.has(seeded.coverStoragePath)).toBe(false)

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'music_deleted'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('music')
    expect(rows[0]!.resourceId).toBe(String(seeded.id))
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('throws NOT_FOUND when the music does not exist', async () => {
    const ctx = makeAuthedCtx({ db })
    await expect(call(adminMusicRouter.delete, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

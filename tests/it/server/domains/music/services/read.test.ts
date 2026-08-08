import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
// music/services/read against the real DB; only mock: the public-URL seam (storage is a true external).
import { music } from '@/server/infra/db/schema/media'

const publicUrlMock = vi.hoisted(() => ({
  resolveAssetUrl: vi.fn((_driver: string, p: string) => `https://cdn.example.com/${p}`),
  safeResolveAssetUrl: vi.fn<(_driver: string, p: string) => string | null>(
    (_driver: string, p: string) => `https://cdn.example.com/${p}`,
  ),
}))

vi.mock('@/server/infra/storage/public-url', () => publicUrlMock)

const { DEFAULT_MUSIC_COVER_URL, getMusicMetaForPlayer, getPublicMusicMetasByIds } =
  await import('@/server/domains/music/services/read')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
  publicUrlMock.safeResolveAssetUrl.mockImplementation(
    (_driver: string, path: string) => `https://cdn.example.com/${path}`,
  )
})

async function seedMusic(overrides: Partial<typeof music.$inferInsert> = {}) {
  const rows = await db
    .insert(music)
    .values({
      source: 'manual',
      sourceId: 'sid',
      playerId: 'p1',
      name: 'Song',
      artist: 'Artist',
      album: 'Album',
      audioStoragePath: 'musics/a.mp3',
      coverStoragePath: 'musics/c.jpg',
      storageDriver: 's3',
      ...overrides,
    })
    .returning()
  return rows[0]
}

describe('music/services/read — DEFAULT_MUSIC_COVER_URL', () => {
  it('points at the bundled default-asset route', () => {
    expect(DEFAULT_MUSIC_COVER_URL).toBe('/images/default-music-cover.png')
  })
})

describe('music/services/read — getMusicMetaForPlayer', () => {
  it('returns null when the row is missing', async () => {
    expect(await getMusicMetaForPlayer(db, 'unknown')).toBeNull()
  })

  it('maps the row with both storage URLs built', async () => {
    await seedMusic()
    const meta = await getMusicMetaForPlayer(db, 'p1')
    expect(meta).toEqual({
      id: 'p1',
      name: 'Song',
      artist: 'Artist',
      album: 'Album',
      url: 'https://cdn.example.com/musics/a.mp3',
      pic: 'https://cdn.example.com/musics/c.jpg',
      lyric: '',
    })
  })

  it('falls back to the default cover when the cover URL is unbuildable', async () => {
    await seedMusic()
    publicUrlMock.safeResolveAssetUrl.mockImplementation((_driver: string, path: string) =>
      path === 'musics/c.jpg' ? null : `https://cdn.example.com/${path}`,
    )
    const meta = await getMusicMetaForPlayer(db, 'p1')
    expect(meta).not.toBeNull()
    expect(meta!.pic).toBe(DEFAULT_MUSIC_COVER_URL)
    expect(meta!.url).toBe('https://cdn.example.com/musics/a.mp3')
  })

  it('returns null when the audio URL is unbuildable (unplayable ≠ coverless)', async () => {
    await seedMusic()
    publicUrlMock.safeResolveAssetUrl.mockImplementation((_driver: string, path: string) =>
      path === 'musics/a.mp3' ? null : `https://cdn.example.com/${path}`,
    )
    expect(await getMusicMetaForPlayer(db, 'p1')).toBeNull()
  })
})

describe('music/services/read — getPublicMusicMetasByIds', () => {
  it('returns an empty map for empty input', async () => {
    expect(await getPublicMusicMetasByIds(db, [])).toEqual(new Map())
  })

  it('resolves every row in one batch query, keyed by playerId', async () => {
    await seedMusic()
    await seedMusic({
      sourceId: 'sid2',
      playerId: 'p2',
      name: 'Two',
      audioStoragePath: 'musics/a2.mp3',
      coverStoragePath: 'musics/c2.jpg',
    })
    const metas = await getPublicMusicMetasByIds(db, ['p1', 'p2', 'missing'])
    expect([...metas.keys()]).toEqual(['p1', 'p2'])
    expect(metas.get('p2')?.name).toBe('Two')
  })

  it('keeps a coverless track playable with the default cover', async () => {
    await seedMusic()
    publicUrlMock.safeResolveAssetUrl.mockImplementation((_driver: string, path: string) =>
      path === 'musics/c.jpg' ? null : `https://cdn.example.com/${path}`,
    )
    const metas = await getPublicMusicMetasByIds(db, ['p1'])
    expect(metas.get('p1')?.pic).toBe(DEFAULT_MUSIC_COVER_URL)
  })

  it('drops entries whose audio URL is unbuildable', async () => {
    await seedMusic()
    publicUrlMock.safeResolveAssetUrl.mockReturnValue(null)
    const metas = await getPublicMusicMetasByIds(db, ['p1'])
    expect(metas.size).toBe(0)
  })
})

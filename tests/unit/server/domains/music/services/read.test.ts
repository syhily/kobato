import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicRow } from '@/server/infra/db/types'

// music/services/read.ts — the row→meta mapping is the single owner of music
// URL building. These tests pin the default-cover semantics: an unbuildable
// cover falls back to the bundled default vinyl image (the track stays
// playable), while an unbuildable audio URL drops the entry entirely.

const opsMock = vi.hoisted(() => ({
  findMusicByPlayerId: vi.fn(),
  findMusicByPlayerIds: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  safeBuildMusicPublicUrl: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/music', () => opsMock)
vi.mock('@/server/domains/music/storage', () => storageMock)

const { DEFAULT_MUSIC_COVER_URL, getMusicMetaForPlayer, getPublicMusicMetasByIds } =
  await import('@/server/domains/music/services/read')

const fakeDb = {} as NodePgDatabase

function makeRow(overrides: Partial<MusicRow> = {}): MusicRow {
  return {
    id: 1n,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    source: 'manual',
    sourceId: 'sid',
    playerId: 'p1',
    name: 'Song',
    artist: 'Artist',
    album: 'Album',
    audioStoragePath: 'musics/a.mp3',
    coverStoragePath: 'musics/c.jpg',
    storageDriver: 's3',
    lyric: null,
    uploaderId: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  storageMock.safeBuildMusicPublicUrl.mockImplementation((path: string) => `https://cdn.example.com/${path}`)
})

describe('music/services/read — DEFAULT_MUSIC_COVER_URL', () => {
  it('points at the bundled default-asset route', () => {
    expect(DEFAULT_MUSIC_COVER_URL).toBe('/images/default-music-cover.png')
  })
})

describe('music/services/read — getMusicMetaForPlayer', () => {
  it('returns null when the row is missing', async () => {
    opsMock.findMusicByPlayerId.mockResolvedValue(null)
    expect(await getMusicMetaForPlayer(fakeDb, 'unknown')).toBeNull()
  })

  it('maps the row with both storage URLs built', async () => {
    opsMock.findMusicByPlayerId.mockResolvedValue(makeRow())
    const meta = await getMusicMetaForPlayer(fakeDb, 'p1')
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
    opsMock.findMusicByPlayerId.mockResolvedValue(makeRow())
    storageMock.safeBuildMusicPublicUrl.mockImplementation((path: string) =>
      path === 'musics/c.jpg' ? null : `https://cdn.example.com/${path}`,
    )
    const meta = await getMusicMetaForPlayer(fakeDb, 'p1')
    expect(meta).not.toBeNull()
    expect(meta!.pic).toBe(DEFAULT_MUSIC_COVER_URL)
    expect(meta!.url).toBe('https://cdn.example.com/musics/a.mp3')
  })

  it('returns null when the audio URL is unbuildable (unplayable ≠ coverless)', async () => {
    opsMock.findMusicByPlayerId.mockResolvedValue(makeRow())
    storageMock.safeBuildMusicPublicUrl.mockImplementation((path: string) =>
      path === 'musics/a.mp3' ? null : `https://cdn.example.com/${path}`,
    )
    expect(await getMusicMetaForPlayer(fakeDb, 'p1')).toBeNull()
  })
})

describe('music/services/read — getPublicMusicMetasByIds', () => {
  it('returns an empty map for empty input', async () => {
    opsMock.findMusicByPlayerIds.mockResolvedValue([])
    expect(await getPublicMusicMetasByIds(fakeDb, [])).toEqual(new Map())
  })

  it('resolves every row in one batch query, keyed by playerId', async () => {
    opsMock.findMusicByPlayerIds.mockResolvedValue([makeRow(), makeRow({ id: 2n, playerId: 'p2', name: 'Two' })])
    const metas = await getPublicMusicMetasByIds(fakeDb, ['p1', 'p2', 'missing'])
    expect(opsMock.findMusicByPlayerIds).toHaveBeenCalledTimes(1)
    expect(opsMock.findMusicByPlayerIds).toHaveBeenCalledWith(fakeDb, ['p1', 'p2', 'missing'])
    expect([...metas.keys()]).toEqual(['p1', 'p2'])
    expect(metas.get('p2')?.name).toBe('Two')
  })

  it('keeps a coverless track playable with the default cover', async () => {
    opsMock.findMusicByPlayerIds.mockResolvedValue([makeRow()])
    storageMock.safeBuildMusicPublicUrl.mockImplementation((path: string) =>
      path === 'musics/c.jpg' ? null : `https://cdn.example.com/${path}`,
    )
    const metas = await getPublicMusicMetasByIds(fakeDb, ['p1'])
    expect(metas.get('p1')?.pic).toBe(DEFAULT_MUSIC_COVER_URL)
  })

  it('drops entries whose audio URL is unbuildable', async () => {
    opsMock.findMusicByPlayerIds.mockResolvedValue([makeRow()])
    storageMock.safeBuildMusicPublicUrl.mockReturnValue(null)
    const metas = await getPublicMusicMetasByIds(fakeDb, ['p1'])
    expect(metas.size).toBe(0)
  })
})

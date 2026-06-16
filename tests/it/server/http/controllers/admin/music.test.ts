import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/music/services/read', () => ({
  listMusicForAdmin: vi.fn(),
}))

vi.mock('@/server/domains/music/services/search', () => ({
  searchMusic: vi.fn(),
}))

vi.mock('@/server/domains/music/services/write/add', () => ({
  addMusic: vi.fn(),
}))
vi.mock('@/server/domains/music/services/write/metadata', () => ({
  updateMusicMetadata: vi.fn(),
}))
vi.mock('@/server/domains/music/services/write/delete', () => ({
  deleteMusic: vi.fn(),
}))

const readService = await import('@/server/domains/music/services/read')
const searchService = await import('@/server/domains/music/services/search')
const addService = await import('@/server/domains/music/services/write/add')
const metadataService = await import('@/server/domains/music/services/write/metadata')
const deleteService = await import('@/server/domains/music/services/write/delete')
const { adminMusicRouter } = await import('@/server/http/controllers/admin/music.controller')

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
  it('returns musics, total and hasMore', async () => {
    vi.mocked(readService.listMusicForAdmin).mockResolvedValueOnce({
      musics: [musicStub],
      total: 1,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminMusicRouter.list, {}, { context: ctx })
    expect(res.musics).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })
})

describe('adminMusicRouter.search', () => {
  it('returns search results', async () => {
    vi.mocked(searchService.searchMusic).mockResolvedValueOnce({
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
    const ctx = makeAuthedCtx()
    const res = await call(adminMusicRouter.search, { keyword: 'Song' }, { context: ctx })
    expect(res.results).toHaveLength(1)
    expect(res.results[0].name).toBe('Song')
  })
})

describe('adminMusicRouter.add', () => {
  it('returns the added music', async () => {
    vi.mocked(addService.addMusic).mockResolvedValueOnce(musicStub)
    const ctx = makeAuthedCtx()
    const res = await call(adminMusicRouter.add, { source: 'netease', sourceId: '12345' }, { context: ctx })
    expect(res.music.id).toBe('1')
  })
})

describe('adminMusicRouter.update', () => {
  it('returns the updated music', async () => {
    vi.mocked(metadataService.updateMusicMetadata).mockResolvedValueOnce(musicStub)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminMusicRouter.update,
      { id: '1', name: 'Updated Song', artist: ['Artist'] },
      { context: ctx },
    )
    expect(res.music.name).toBe('Song')
  })

  it('passes the viewer context to the service', async () => {
    vi.mocked(metadataService.updateMusicMetadata).mockResolvedValueOnce(musicStub)
    const ctx = makeAuthedCtx({ userId: '42', role: 'author' })
    await call(
      adminMusicRouter.update,
      { id: '1', name: 'Updated Song', artist: ['Artist'], album: 'Album', lyric: '[00:00] Hi' },
      { context: ctx },
    )
    expect(metadataService.updateMusicMetadata).toHaveBeenCalledWith(
      ctx.db,
      {
        id: 1n,
        name: 'Updated Song',
        artist: ['Artist'],
        album: 'Album',
        lyric: '[00:00] Hi',
      },
      { userId: '42', role: 'author' },
    )
  })
})

describe('adminMusicRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(deleteService.deleteMusic).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminMusicRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })

  it('throws NOT_FOUND when the music does not exist', async () => {
    vi.mocked(deleteService.deleteMusic).mockRejectedValueOnce(
      Object.assign(new Error('音乐不存在'), { code: 'NOT_FOUND' }),
    )
    const ctx = makeAuthedCtx()
    await expect(call(adminMusicRouter.delete, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

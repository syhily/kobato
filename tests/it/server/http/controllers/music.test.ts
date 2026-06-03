import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/music/services/read', () => ({
  getMusicMetaForPlayer: vi.fn(),
}))

const musicService = await import('@/server/domains/music/services/read')
const { musicRouter } = await import('@/server/http/controllers/music.controller')

describe('musicRouter.get', () => {
  it('returns music meta on hit', async () => {
    vi.mocked(musicService.getMusicMetaForPlayer).mockResolvedValueOnce({
      id: 'abc123def4567890',
      name: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      url: 'https://cdn.example.com/musics/abc123def4567890.mp3',
      pic: 'https://cdn.example.com/musics/abc123def4567890.jpg',
      lyric: '[00:00.00]Lyric line 1',
    })
    const ctx = makePublicCtx()
    const res = (await call(musicRouter.get, { id: 'abc123def4567890' }, { context: ctx })) as {
      music: { id: string; name: string }
    }
    expect(res.music.id).toBe('abc123def4567890')
    expect(res.music.name).toBe('Test Song')
  })

  it('throws NOT_FOUND when music is missing', async () => {
    vi.mocked(musicService.getMusicMetaForPlayer).mockResolvedValueOnce(null)
    const ctx = makePublicCtx()
    await expect(call(musicRouter.get, { id: '0000000000000000' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const putMock = vi.fn()
const deleteMock = vi.fn()
const localBackend = { driver: 'local', put: vi.fn(), delete: vi.fn() } as const

vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: vi.fn(() => ({ backend: { put: putMock, delete: deleteMock }, driver: 's3' })),
  backendFor: vi.fn((driver: string) =>
    driver === 'local' ? { delete: localBackend.delete } : { delete: deleteMock },
  ),
}))

vi.mock('@/server/infra/storage/public-url', () => ({
  resolveAssetUrl: vi.fn((_driver: string, path: string) => `https://cdn.example.com/${path}`),
  safeResolveAssetUrl: vi.fn((_driver: string, path: string) => `https://cdn.example.com/${path}`),
}))

import {
  buildMusicPublicUrl,
  deleteMusicObject,
  putMusicAudio,
  putMusicCover,
  safeBuildMusicPublicUrl,
} from '@/server/domains/music/storage'
import { resolveAssetUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'
import { backendFor } from '@/server/infra/storage/registry'

describe('server/domains/music/storage', () => {
  beforeEach(() => {
    putMock.mockReset()
    deleteMock.mockReset()
    localBackend.delete.mockReset()
  })

  it('putMusicAudio forwards audio/mpeg to the active backend and returns its driver', async () => {
    putMock.mockResolvedValue(undefined)
    const result = await putMusicAudio('musics/a.mp3', Buffer.from('audio'))
    expect(putMock).toHaveBeenCalledWith({
      key: 'musics/a.mp3',
      body: expect.any(Buffer),
      contentType: 'audio/mpeg',
      visibility: 'public',
    })
    expect(result.driver).toBe('s3')
  })

  it('putMusicCover forwards image/jpeg to the active backend', async () => {
    putMock.mockResolvedValue(undefined)
    await putMusicCover('musics/c.jpg', Buffer.from('img'))
    expect(putMock).toHaveBeenCalledWith({
      key: 'musics/c.jpg',
      body: expect.any(Buffer),
      contentType: 'image/jpeg',
      visibility: 'public',
    })
  })

  it('deleteMusicObject dispatches to the asset driver', async () => {
    await deleteMusicObject('musics/a.mp3', 's3')
    expect(deleteMock).toHaveBeenCalledWith('musics/a.mp3')
    await deleteMusicObject('musics/a.mp3', 'local')
    expect(localBackend.delete).toHaveBeenCalledWith('musics/a.mp3')
  })

  it('deleteMusicObject defaults to s3 when no driver is given', async () => {
    await deleteMusicObject('musics/a.mp3')
    expect(backendFor).toHaveBeenLastCalledWith('s3')
  })

  it('buildMusicPublicUrl delegates to resolveAssetUrl with the driver', () => {
    expect(buildMusicPublicUrl('musics/a.mp3', 's3')).toBe('https://cdn.example.com/musics/a.mp3')
    expect(resolveAssetUrl).toHaveBeenCalledWith('s3', 'musics/a.mp3')
  })

  it('safeBuildMusicPublicUrl delegates to safeResolveAssetUrl with the driver', () => {
    safeBuildMusicPublicUrl('musics/a.mp3', 'local')
    expect(safeResolveAssetUrl).toHaveBeenCalledWith('local', 'musics/a.mp3')
  })
})

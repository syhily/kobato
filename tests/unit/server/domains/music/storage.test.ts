import { describe, expect, it, vi } from 'vitest'

import { ActionFailure } from '@/server/infra/http/errors'

vi.mock('@/server/infra/storage/public-url', () => ({
  getPublicBaseUrl: vi.fn(),
}))

vi.mock('@/server/infra/storage/s3-client', () => ({
  deleteS3Object: vi.fn(),
  getS3StorageContext: vi.fn(),
  putPublicS3Object: vi.fn(),
}))

import {
  buildMusicPublicUrl,
  deleteMusicObject,
  ensureMusicStorageEnabled,
  putMusicAudio,
  putMusicCover,
  safeBuildMusicPublicUrl,
} from '@/server/domains/music/storage'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { deleteS3Object, getS3StorageContext, putPublicS3Object } from '@/server/infra/storage/s3-client'

describe('server/domains/music/storage — putMusicAudio', () => {
  it('forwards the buffer to s3 with audio/mpeg content-type', async () => {
    vi.mocked(putPublicS3Object).mockResolvedValue(undefined)
    await putMusicAudio('musics/a.mp3', Buffer.from('audio'))
    expect(putPublicS3Object).toHaveBeenCalledWith({
      key: 'musics/a.mp3',
      body: expect.any(Buffer),
      contentType: 'audio/mpeg',
    })
  })
})

describe('server/domains/music/storage — putMusicCover', () => {
  it('forwards the buffer to s3 with image/jpeg content-type', async () => {
    vi.mocked(putPublicS3Object).mockResolvedValue(undefined)
    await putMusicCover('musics/c.jpg', Buffer.from('img'))
    expect(putPublicS3Object).toHaveBeenCalledWith({
      key: 'musics/c.jpg',
      body: expect.any(Buffer),
      contentType: 'image/jpeg',
    })
  })
})

describe('server/domains/music/storage — deleteMusicObject', () => {
  it('forwards the key to deleteS3Object', async () => {
    vi.mocked(deleteS3Object).mockResolvedValue(undefined)
    await deleteMusicObject('musics/a.mp3')
    expect(deleteS3Object).toHaveBeenCalledWith('musics/a.mp3')
  })
})

describe('server/domains/music/storage — ensureMusicStorageEnabled', () => {
  it('calls getS3StorageContext', async () => {
    vi.mocked(getS3StorageContext).mockResolvedValue({} as never)
    await ensureMusicStorageEnabled()
    expect(getS3StorageContext).toHaveBeenCalled()
  })
})

describe('server/domains/music/storage — buildMusicPublicUrl', () => {
  it('combines the public base url with the (trimmed) storage path', () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue('https://cdn.example.com')
    expect(buildMusicPublicUrl('musics/a.mp3')).toBe('https://cdn.example.com/musics/a.mp3')
    expect(buildMusicPublicUrl('/musics/a.mp3')).toBe('https://cdn.example.com/musics/a.mp3')
  })

  it('throws ActionFailure(503) when publicBaseUrl is null', () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue(null)
    expect(() => buildMusicPublicUrl('x')).toThrow(ActionFailure)
  })
})

describe('server/domains/music/storage — safeBuildMusicPublicUrl', () => {
  it('returns null when publicBaseUrl is null', () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue(null)
    expect(safeBuildMusicPublicUrl('x')).toBeNull()
  })

  it('returns the resolved url when publicBaseUrl is set', () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue('https://cdn.example.com')
    expect(safeBuildMusicPublicUrl('musics/a.mp3')).toBe('https://cdn.example.com/musics/a.mp3')
  })

  it('strips a leading slash before joining', () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue('https://cdn.example.com')
    expect(safeBuildMusicPublicUrl('/musics/a.mp3')).toBe('https://cdn.example.com/musics/a.mp3')
  })
})

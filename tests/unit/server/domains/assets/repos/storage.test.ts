import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/storage/s3-client', () => ({
  deleteS3Object: vi.fn().mockResolvedValue(undefined),
  getS3ObjectBuffer: vi.fn(),
  putS3Object: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import {
  deleteBrandingObject,
  ensureMatchesSlot,
  fetchBrandingObject,
  isBinarySlot,
  isBrandingSlot,
  isSvgSlot,
  putBrandingObject,
  s3KeyForSlot,
} from '@/server/domains/assets/repos/storage'
import { deleteS3Object, getS3ObjectBuffer, putS3Object } from '@/server/infra/storage/s3-client'

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const svgBuffer = Buffer.from('<?xml version="1.0"?><svg></svg>')

describe('assets storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies branding slots', () => {
    expect(isBrandingSlot('logoSvg')).toBe(true)
    expect(isBrandingSlot('not-a-slot')).toBe(false)
    expect(isSvgSlot('logoSvg')).toBe(true)
    expect(isBinarySlot('icon192')).toBe(true)
    expect(isSvgSlot('icon192')).toBe(false)
  })

  it('derives an s3 key for a slot', () => {
    expect(s3KeyForSlot('faviconIco')).toBe('branding/favicon.ico')
    expect(s3KeyForSlot('blogPosterDark')).toBe('branding/blog-poster-dark.png')
    expect(s3KeyForSlot('logoSvg')).toBe('branding/logo.svg')
  })

  it('validates an SVG upload', () => {
    expect(() => ensureMatchesSlot('logoSvg', svgBuffer)).not.toThrow()
  })

  it('rejects a non-svg upload for an SVG slot', () => {
    expect(() => ensureMatchesSlot('logoSvg', pngHeader)).toThrow('不是有效的 SVG')
  })

  it('rejects an SVG with scripts', () => {
    const bad = Buffer.from('<svg><script>alert(1)</script></svg>')
    expect(() => ensureMatchesSlot('logoSvg', bad)).toThrow('脚本')
  })

  it('validates a PNG upload for a binary slot', () => {
    expect(() => ensureMatchesSlot('icon192', pngHeader)).not.toThrow()
  })

  it('rejects an empty upload', () => {
    expect(() => ensureMatchesSlot('icon192', Buffer.alloc(0))).toThrow('为空')
  })

  it('rejects an oversized upload', () => {
    const huge = Buffer.alloc(10 * 1024 * 1024)
    expect(() => ensureMatchesSlot('icon192', huge)).toThrow('超过')
  })

  it('uploads a branding object', async () => {
    const ref = await putBrandingObject('icon192', pngHeader)
    expect(ref.contentType).toBe('image/png')
    expect(putS3Object).toHaveBeenCalled()
  })

  it('deletes a branding object and swallows s3 errors', async () => {
    ;(deleteS3Object as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'))
    await expect(deleteBrandingObject('icon192')).resolves.toBeUndefined()
  })

  it('fetches a branding object from cache or s3', async () => {
    ;(getS3ObjectBuffer as ReturnType<typeof vi.fn>).mockResolvedValue(pngHeader)
    const buffer = await fetchBrandingObject('icon192', {
      etag: 'a',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })
    expect(buffer).toBe(pngHeader)
    // second call should hit cache
    const cached = await fetchBrandingObject('icon192', {
      etag: 'a',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })
    expect(cached).toBe(pngHeader)
  })

  it('returns null when s3 fetch fails', async () => {
    ;(getS3ObjectBuffer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))
    const buffer = await fetchBrandingObject('icon192', {
      etag: 'b',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })
    expect(buffer).toBeNull()
  })

  it('auto-migrates from legacy extensionless key when new key is not found', async () => {
    // First call (new key `branding/icon-192.png`) → not found.
    // Second call (legacy key `branding/icon-192`) → found → auto-migrate.
    ;(getS3ObjectBuffer as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Not Found'))
      .mockResolvedValueOnce(pngHeader)

    const buffer = await fetchBrandingObject('icon192', {
      etag: 'c',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })

    expect(buffer).toBe(pngHeader)
    expect(getS3ObjectBuffer).toHaveBeenCalledTimes(2)
    expect(getS3ObjectBuffer).toHaveBeenNthCalledWith(1, 'branding/icon-192.png')
    expect(getS3ObjectBuffer).toHaveBeenNthCalledWith(2, 'branding/icon-192')
    // Migration: copy to new key + delete legacy
    expect(putS3Object).toHaveBeenCalledWith('branding/icon-192.png', pngHeader, 'image/png')
    expect(deleteS3Object).toHaveBeenCalledWith('branding/icon-192')
  })

  it('auto-migrates and still returns null when both keys are missing', async () => {
    // Both new and legacy keys return 404.
    ;(getS3ObjectBuffer as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Not Found'))
      .mockRejectedValueOnce(new Error('Not Found'))

    const buffer = await fetchBrandingObject('icon192', {
      etag: 'd',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })

    expect(buffer).toBeNull()
    expect(getS3ObjectBuffer).toHaveBeenCalledTimes(2)
    expect(putS3Object).not.toHaveBeenCalled()
    expect(deleteS3Object).not.toHaveBeenCalled()
  })
})

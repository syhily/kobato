import { makeMemoryBackend } from '#/_helpers/memory-storage'

import {
  deleteBrandingObject,
  ensureMatchesSlot,
  fetchBrandingObject,
  isBinarySlot,
  isBrandingSlot,
  isSvgSlot,
  putBrandingObject,
  s3KeyForSlot,
} from '@kobato/server/domains/assets/services/storage'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The branding repo talks to storage exclusively through the registry, so
// the tests substitute the seam's 's3' backend with the shared in-memory
// one and assert on observable state — stored objects, put/delete history —
// never on S3 internals. vi.spyOn on the memory backend is used only to
// inject failures the in-memory store cannot produce on its own.
const mem = makeMemoryBackend()

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const svgBuffer = Buffer.from('<?xml version="1.0"?><svg></svg>')

describe('assets storage', () => {
  beforeEach(() => {
    __setStorageBackendForTests('s3', mem.backend)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetStorageBackendsForTests()
    mem.reset()
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
    expect(ref.driver).toBe('s3')
    expect(mem.putKeys).toEqual(['branding/icon-192.png'])
    const stored = mem.store.get('branding/icon-192.png')
    expect(stored?.body.equals(pngHeader)).toBe(true)
    expect(stored?.contentType).toBe('image/png')
  })

  it('deletes a branding object and swallows backend errors', async () => {
    vi.spyOn(mem.backend, 'delete').mockRejectedValue(new Error('not found'))
    await expect(deleteBrandingObject('icon192')).resolves.toBeUndefined()
  })

  it('fetches a branding object from cache or the backend', async () => {
    mem.store.set('branding/icon-192.png', { body: pngHeader, contentType: 'image/png' })
    const ref = { etag: 'a', contentType: 'image/png', size: 8, updatedAt: '', driver: 's3' as const }

    const buffer = await fetchBrandingObject('icon192', ref)
    expect(buffer).toBe(pngHeader)

    // Drop the stored object: the second call must come from the in-process
    // cache.
    mem.store.delete('branding/icon-192.png')
    const cached = await fetchBrandingObject('icon192', ref)
    expect(cached).toBe(pngHeader)
  })

  it('returns null when the backend fetch fails', async () => {
    const getSpy = vi.spyOn(mem.backend, 'get').mockRejectedValueOnce(new Error('down'))
    const buffer = await fetchBrandingObject('icon192', {
      etag: 'b',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })
    expect(buffer).toBeNull()
    // A non-not-found failure must NOT probe the legacy key — only the
    // seam's typed `StorageObjectNotFound` triggers the auto-migration.
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('auto-migrates from legacy extensionless key when new key is not found', async () => {
    // The legacy extensionless key holds the bytes; the current key is
    // absent, so the memory backend's StorageObjectNotFound triggers the
    // migration path.
    mem.store.set('branding/icon-192', { body: pngHeader, contentType: 'image/png' })

    const buffer = await fetchBrandingObject('icon192', {
      etag: 'c',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })

    expect(buffer).toBe(pngHeader)
    // Migration: the bytes were copied to the current key and the legacy
    // object was deleted.
    expect(mem.putKeys).toEqual(['branding/icon-192.png'])
    expect(mem.store.get('branding/icon-192.png')?.body).toBe(pngHeader)
    expect(mem.deletedKeys).toEqual(['branding/icon-192'])
    expect(mem.store.has('branding/icon-192')).toBe(false)
  })

  it('auto-migrates and still returns null when both keys are missing', async () => {
    // Both new and legacy keys are absent — the memory backend rejects
    // missing-key reads with StorageObjectNotFound on its own.
    const buffer = await fetchBrandingObject('icon192', {
      etag: 'd',
      contentType: 'image/png',
      size: 8,
      updatedAt: '',
      driver: 's3',
    })

    expect(buffer).toBeNull()
    expect(mem.putKeys).toHaveLength(0)
    expect(mem.deletedKeys).toHaveLength(0)
  })
})

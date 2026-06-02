import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/images/service', () => ({
  deleteImage: vi.fn(),
  listImagesForAdmin: vi.fn(),
  recalculateImageThumbhash: vi.fn(),
  updateImageNote: vi.fn(),
  uploadImage: vi.fn(),
}))

const service = await import('@/server/domains/images/service')
const { adminImagesRouter } = await import('@/server/http/controllers/admin/images.controller')

const image = {
  id: '1',
  kind: 'generic' as const,
  storagePath: 'images/2026/01/01.jpg',
  publicUrl: 'https://cdn.example.com/images/2026/01/01.jpg',
  mimeType: 'image/jpeg',
  width: 1920,
  height: 1080,
  byteSize: 204800,
  thumbhash: 'abc123',
  uploaderId: '1',
  uploaderName: 'Alice',
  note: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('adminImagesRouter.list', () => {
  it('returns images, total and hasMore', async () => {
    vi.mocked(service.listImagesForAdmin).mockResolvedValueOnce({
      images: [image],
      total: 1,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.list, { q: 'cat', kind: 'generic' }, { context: ctx })
    expect(res.images).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })
})

describe('adminImagesRouter.delete', () => {
  it('resolves to undefined on success', async () => {
    vi.mocked(service.deleteImage).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminImagesRouter.updateNote', () => {
  it('returns updated image', async () => {
    vi.mocked(service.updateImageNote).mockResolvedValueOnce({
      ...image,
      note: 'Updated note',
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.updateNote, { id: '1', note: 'Updated note' }, { context: ctx })
    expect(res.image.note).toBe('Updated note')
  })
})

describe('adminImagesRouter.recalculateThumbhash', () => {
  it('returns image with recalculated thumbhash', async () => {
    vi.mocked(service.recalculateImageThumbhash).mockResolvedValueOnce(image)
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.recalculateThumbhash, { id: '1' }, { context: ctx })
    expect(res.image.id).toBe('1')
  })
})

import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/images/services/admin-read', () => ({
  listImagesForAdmin: vi.fn(),
}))

vi.mock('@/server/domains/images/services/admin-mutate', () => ({
  deleteImage: vi.fn(),
  recalculateImageThumbhash: vi.fn(),
  updateImageNote: vi.fn(),
}))

vi.mock('@/server/domains/images/services/upload', () => ({
  assertImageUploadAllowed: vi.fn(),
  uploadImage: vi.fn(),
}))

// The upload handler reads `assets.upload.{maxBytes,jpegQuality}` from the
// settings bundle; pin the section so the orchestration assertions below
// can check the exact values handed to the domain service.
vi.mock('@/shared/config/getters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config/getters')>()),
  requireBlogSettingsSection: vi.fn((section: string) => {
    if (section === 'assets') {
      return { upload: { maxBytes: 1024, jpegQuality: 80 } }
    }
    throw new Error(`unexpected settings section: ${section}`)
  }),
}))

const adminRead = await import('@/server/domains/images/services/admin-read')
const adminMutate = await import('@/server/domains/images/services/admin-mutate')
const uploadService = await import('@/server/domains/images/services/upload')
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
    vi.mocked(adminRead.listImagesForAdmin).mockResolvedValueOnce({
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
    vi.mocked(adminMutate.deleteImage).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminImagesRouter.updateNote', () => {
  it('returns updated image', async () => {
    vi.mocked(adminMutate.updateImageNote).mockResolvedValueOnce({
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
    vi.mocked(adminMutate.recalculateImageThumbhash).mockResolvedValueOnce(image)
    const ctx = makeAuthedCtx()
    const res = await call(adminImagesRouter.recalculateThumbhash, { id: '1' }, { context: ctx })
    expect(res.image.id).toBe('1')
  })
})

describe('adminImagesRouter.upload — orchestration only', () => {
  // The validation rules themselves (MIME allowlist, size cap, magic-byte
  // sniffing) are pinned at the domain seam in
  // tests/unit/server/domains/images/services/upload.test.ts; here we only
  // pin that the controller wires the declared file + settings into the
  // domain and routes the kind dispatch.
  it('validates the declared file against the configured cap, then uploads', async () => {
    vi.mocked(uploadService.uploadImage).mockResolvedValueOnce(image)
    const ctx = makeAuthedCtx()
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    const res = await call(adminImagesRouter.upload, { file, metadata: { kind: 'generic' } }, { context: ctx })

    expect(res.image.id).toBe('1')
    expect(uploadService.assertImageUploadAllowed).toHaveBeenCalledWith(file, 1024)
    expect(uploadService.uploadImage).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({
        kind: { kind: 'generic' },
        note: null,
        maxBytes: 1024,
        jpegQuality: 80,
        // The session stub carries only id + role, so the resolved
        // uploader name is undefined here; the domain maps it to null.
        uploader: { id: 1n, name: undefined },
      }),
    )
  })

  it('routes the category kind with its slug to the domain upload', async () => {
    vi.mocked(uploadService.uploadImage).mockResolvedValueOnce(image)
    const ctx = makeAuthedCtx()
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    await call(
      adminImagesRouter.upload,
      { file, metadata: { kind: 'category', slug: 'tech', note: 'cover' } },
      { context: ctx },
    )

    expect(uploadService.uploadImage).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({ kind: { kind: 'category', slug: 'tech' }, note: 'cover' }),
    )
  })
})

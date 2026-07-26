import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// upload.ts wires together pure validation (mime sniffing, size guard,
// kind → key resolution) with IO (image processing, S3 put, DB upsert).
// We mock the IO surface so the pure branches — mime-type detection per
// format, size-limit enforcement, kind routing, note trimming — are the
// only things actually exercised here.

const processImageBufferMock = vi.hoisted(() => vi.fn())
const storagePutMock = vi.hoisted(() => vi.fn())
const insertImageMock = vi.hoisted(() => vi.fn())
const upsertImageByStoragePathMock = vi.hoisted(() => vi.fn())
const invalidateCacheMock = vi.hoisted(() => vi.fn())
const toAdminImageDtoMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/image/process', () => ({ processImageBuffer: processImageBufferMock }))
vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: () => ({ backend: { put: storagePutMock }, driver: 's3' }),
}))
vi.mock('@/server/infra/db/operations/image', () => ({
  insertImage: insertImageMock,
  upsertImageByStoragePath: upsertImageByStoragePathMock,
}))
vi.mock('@/server/domains/images/services/cache', () => ({ invalidateImageEnhanceCacheFor: invalidateCacheMock }))
vi.mock('@/server/domains/images/services/admin-read', () => ({ toAdminImageDto: toAdminImageDtoMock }))
vi.mock('@/server/infra/logger', () => ({ getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))

const { assertImageUploadAllowed, uploadImage } = await import('@/server/domains/images/services/upload')

const fakeDb = {} as NodePgDatabase

// Buffer builders for each sniffed format. Magic bytes matter — uploadImage
// rejects anything whose first 12 bytes don't match a known signature.
function jpeg(extra: number[] = []): Buffer {
  // Always >= 12 bytes (3 magic + at least 9 filler) so the sniff check passes.
  const filler = extra.length >= 9 ? extra : [...extra, ...Array(9 - extra.length).fill(0)]
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...filler])
}
function png(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
}
function gif(): Buffer {
  return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6])
}
function webp(): Buffer {
  // RIFF....WEBP
  return Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
}
function avif(brand = 'avif'): Buffer {
  // ftyp box at offset 4: bytes 4-7 = 'ftyp', bytes 8-11 = brand
  const buf = Buffer.alloc(16)
  buf.write('ftyp', 4, 'ascii')
  buf.write(brand, 8, 'ascii')
  return buf
}

function okProcessed(buffer: Buffer) {
  return {
    buffer,
    width: 100,
    height: 100,
    byteSize: buffer.length,
    thumbhash: Buffer.from([0]),
  }
}

describe('images/services/upload — pure validation + mime detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    processImageBufferMock.mockReset()
    storagePutMock.mockResolvedValue({ key: 'images/x.jpg', size: 0 })
    insertImageMock.mockReset()
    upsertImageByStoragePathMock.mockReset()
    invalidateCacheMock.mockResolvedValue(undefined)
    toAdminImageDtoMock.mockReturnValue({ id: '1', storagePath: 'x' })
    // Echo the input buffer back so processed size matches the sniffed one.
    processImageBufferMock.mockImplementation(async ({ buffer }: { buffer: Buffer }) => okProcessed(buffer))
  })

  describe('rejects unsupported / malformed buffers', () => {
    it('throws when the buffer is shorter than 12 bytes', async () => {
      const buf = Buffer.from([1, 2, 3])
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/不支持的图片格式/)
    })

    it('throws when the magic bytes match no known format', async () => {
      const buf = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/不支持的图片格式/)
    })

    it('throws when the AVIF ftyp brand is neither avif nor avis', async () => {
      // ftyp + 'mif1' — recognised box but not an allowed brand.
      const buf = avif('mif1')
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/不支持的图片格式/)
    })

    it('throws when ftyp appears but is too close to the buffer end', async () => {
      // ftyp at the very end (index 8), brand would be out of range.
      const buf = Buffer.alloc(12)
      buf.write('ftyp', 8, 'ascii') // ftypIndex = 8, ftypIndex + 4 = 12 === length → brand read empty
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/不支持的图片格式/)
    })
  })

  describe('accepts each supported format', () => {
    async function run(buf: Buffer) {
      insertImageMock.mockResolvedValue({ storagePath: 'images/x.jpg' })
      return uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
    }

    it('accepts JPEG', async () => {
      await expect(run(jpeg())).resolves.toBeDefined()
      expect(processImageBufferMock).toHaveBeenCalled()
    })
    it('accepts PNG', async () => expect(run(png())).resolves.toBeDefined())
    it('accepts GIF', async () => expect(run(gif())).resolves.toBeDefined())
    it('accepts WebP', async () => expect(run(webp())).resolves.toBeDefined())
    it('accepts AVIF (avif brand)', async () => expect(run(avif('avif'))).resolves.toBeDefined())
    it('accepts AVIF sequence (avis brand)', async () => expect(run(avif('avis'))).resolves.toBeDefined())
  })

  describe('size enforcement', () => {
    it('throws BAD_REQUEST when the input buffer exceeds maxBytes', async () => {
      const buf = png()
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: buf.length - 1,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/图片体积超过上限/)
      expect(processImageBufferMock).not.toHaveBeenCalled()
    })

    it('throws when the re-encoded buffer exceeds maxBytes', async () => {
      const original = png()
      // processed returns something bigger than the limit.
      processImageBufferMock.mockResolvedValue({
        buffer: Buffer.alloc(original.length + 100),
        width: 1,
        height: 1,
        byteSize: original.length + 100,
        thumbhash: Buffer.from([0]),
      })
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: original,
          maxBytes: original.length + 10,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/重编码后体积超过上限/)
      expect(storagePutMock).not.toHaveBeenCalled()
    })
  })

  describe('kind routing — generic insert vs state-key upsert', () => {
    it('uses insertImage for the generic kind', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      const buf = jpeg()
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(insertImageMock).toHaveBeenCalledTimes(1)
      expect(upsertImageByStoragePathMock).not.toHaveBeenCalled()
    })

    it('swallows a duplicate-key insert failure into a friendly DomainError', async () => {
      insertImageMock.mockRejectedValue(new Error('unique constraint violation'))
      const buf = jpeg()
      await expect(
        uploadImage(fakeDb, {
          kind: { kind: 'generic' },
          buffer: buf,
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/图片元数据写入失败/)
    })

    it('uses upsertImageByStoragePath for a category kind', async () => {
      upsertImageByStoragePathMock.mockResolvedValue({ storagePath: 'images/categories/x.jpg' })
      const buf = jpeg()
      await uploadImage(fakeDb, {
        kind: { kind: 'category', slug: 'my-slug' },
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(upsertImageByStoragePathMock).toHaveBeenCalledTimes(1)
      expect(insertImageMock).not.toHaveBeenCalled()
      const arg = upsertImageByStoragePathMock.mock.calls[0]![1] as { storagePath: string }
      expect(arg.storagePath).toBe('images/categories/my-slug.jpg')
    })

    it('uses upsertImageByStoragePath for a friend kind', async () => {
      upsertImageByStoragePathMock.mockResolvedValue({ storagePath: 'images/links/h.jpg' })
      const buf = jpeg()
      await uploadImage(fakeDb, {
        kind: { kind: 'friend', host: 'example.com' },
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      const arg = upsertImageByStoragePathMock.mock.calls[0]![1] as { storagePath: string }
      expect(arg.storagePath).toBe('images/links/example.com.jpg')
    })
  })

  describe('note normalisation', () => {
    it('trims a note and stores it when non-empty', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        note: '   hello   ',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(insertImageMock.mock.calls[0]![1]).toMatchObject({ note: 'hello' })
    })

    it('stores null for a whitespace-only note', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        note: '   ',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(insertImageMock.mock.calls[0]![1]).toMatchObject({ note: null })
    })

    it('stores null when no note is supplied', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(insertImageMock.mock.calls[0]![1]).toMatchObject({ note: null })
    })
  })

  describe('uploader plumbing', () => {
    it('passes uploader.id to insertImage and uploader.name to the DTO', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        uploader: { id: 42n, name: 'alice' },
        maxBytes: 1000,
        jpegQuality: 80,
      })
      expect(insertImageMock.mock.calls[0]![1]).toMatchObject({ uploaderId: 42n })
      expect(toAdminImageDtoMock).toHaveBeenCalledWith(expect.anything(), 'alice')
    })

    it('passes null uploaderId/name when uploader is absent', async () => {
      insertImageMock.mockResolvedValue({ storagePath: 'images/g.jpg' })
      await uploadImage(fakeDb, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        uploader: null,
        maxBytes: 1000,
        jpegQuality: 80,
      })
      expect(insertImageMock.mock.calls[0]![1]).toMatchObject({ uploaderId: null })
      expect(toAdminImageDtoMock).toHaveBeenCalledWith(expect.anything(), null)
    })
  })
})

describe('assertImageUploadAllowed — declared-envelope validation (sunk from the controller)', () => {
  // These are ORPCErrors (not DomainErrors) so the wire keeps its 400/413
  // split: the declared-size pre-check reports 413 while the authoritative
  // in-buffer checks inside uploadImage report 400.
  it('rejects a declared MIME type outside the allowlist with BAD_REQUEST', () => {
    expect(() => assertImageUploadAllowed({ type: 'image/tiff', size: 10 }, 1000)).toThrow(
      /不支持的图片格式，请上传 JPEG、PNG、WebP、AVIF 或 GIF 格式的图片/,
    )
    try {
      assertImageUploadAllowed({ type: 'image/tiff', size: 10 }, 1000)
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    }
  })

  it('accepts every declared MIME type in the allowlist', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']) {
      expect(() => assertImageUploadAllowed({ type, size: 10 }, 1000)).not.toThrow()
    }
  })

  it('rejects a declared size over maxBytes with PAYLOAD_TOO_LARGE', () => {
    try {
      assertImageUploadAllowed({ type: 'image/png', size: 2 * 1024 * 1024 }, 1024 * 1024)
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', message: '图片体积超过上限（1.0 MB）' })
    }
  })

  it('accepts a declared size exactly at maxBytes', () => {
    expect(() => assertImageUploadAllowed({ type: 'image/png', size: 1000 }, 1000)).not.toThrow()
  })

  it('checks the MIME type before the size (a bad type reports the format error even when oversize)', () => {
    try {
      assertImageUploadAllowed({ type: 'text/plain', size: Number.MAX_SAFE_INTEGER }, 1)
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    }
  })
})

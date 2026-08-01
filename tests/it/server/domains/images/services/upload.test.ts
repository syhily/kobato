import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
// upload.ts wires together pure validation (mime sniffing, size guard,
// kind → key resolution) with IO (image processing, storage put, DB
// insert/upsert). The DB side is REAL here — rows land in the shared
// in-memory SQLite — while sharp (`processImageBuffer`) stays mocked and
// the storage backend is the shared in-memory backend injected through
// the registry seam (a true external — S3/local disk).
import { buildObjectKey } from '@/server/domains/images/key'
import { image } from '@/server/infra/db/schema/media'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

const processImageBufferMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/image/process', () => ({ processImageBuffer: processImageBufferMock }))

// Wrap-don't-replace: the real upsert runs against the real engine on
// every happy path; the wrapper only exists to inject a one-shot DB
// failure for the rollback test below.
vi.mock('@/server/infra/db/operations/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/db/operations/image')>()
  return { ...actual, upsertImageByStoragePath: vi.fn(actual.upsertImageByStoragePath) }
})

// Injected as the 's3' backend; its isAvailable() === true makes S3 the
// ACTIVE backend, so uploads record driver 's3' exactly like production.
const mem = makeMemoryBackend()

const { assertImageUploadAllowed, uploadImage } = await import('@/server/domains/images/services/upload')
const { upsertImageByStoragePath } = await import('@/server/infra/db/operations/image')
const upsertImageByStoragePathMock = vi.mocked(upsertImageByStoragePath)

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
  vi.clearAllMocks()
  // Echo the input buffer back so the processed size matches the sniffed one.
  processImageBufferMock.mockImplementation(async ({ buffer }: { buffer: Buffer }) => ({
    buffer,
    width: 100,
    height: 100,
    byteSize: buffer.length,
    thumbhash: Buffer.from([0]),
  }))
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

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

async function allImageRows() {
  return db.select().from(image)
}

describe('images/services/upload — pure validation + mime detection', () => {
  describe('rejects unsupported / malformed buffers', () => {
    it('throws when the buffer is shorter than 12 bytes', async () => {
      const buf = Buffer.from([1, 2, 3])
      await expect(
        uploadImage(db, {
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
        uploadImage(db, {
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
        uploadImage(db, {
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
        uploadImage(db, {
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
      return uploadImage(db, {
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
        uploadImage(db, {
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
        uploadImage(db, {
          kind: { kind: 'generic' },
          buffer: original,
          maxBytes: original.length + 10,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/重编码后体积超过上限/)
      // Nothing reached the backend or the database.
      expect(mem.store.size).toBe(0)
      expect(await allImageRows()).toHaveLength(0)
    })
  })

  describe('kind routing — generic insert vs state-key upsert', () => {
    it('inserts a new row for the generic kind', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      const rows = await allImageRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].storagePath).toMatch(/^images\/\d{4}\/\d{2}\/\d{16}\.jpg$/)
      expect(rows[0].storageDriver).toBe('s3')
      expect(dto.storagePath).toBe(rows[0].storagePath)
      // The bytes landed on the backend under the row's key.
      expect(mem.store.has(rows[0].storagePath)).toBe(true)
    })

    it('swallows a duplicate-key insert failure into a friendly DomainError', async () => {
      // Freeze the clock so the generic key is deterministic, then occupy
      // it with a real row — the second insert hits the UNIQUE constraint.
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-07-30T12:34:56.789Z'))
        const key = buildObjectKey({ kind: 'generic', now: new Date() })
        await db.insert(image).values({
          storagePath: key,
          storageDriver: 's3',
          mimeType: 'image/jpeg',
          width: 1,
          height: 1,
          byteSize: 1,
        })
        await expect(
          uploadImage(db, {
            kind: { kind: 'generic' },
            buffer: jpeg(),
            maxBytes: 1000,
            jpegQuality: 80,
            uploader: null,
          }),
        ).rejects.toThrow(/图片元数据写入失败/)
        // Still exactly one row — the failed insert left nothing behind.
        expect(await allImageRows()).toHaveLength(1)
        // The object the failed insert orphaned on the backend is rolled
        // back — no storage leak without a referencing row.
        expect(mem.putKeys).toContain(key)
        expect(mem.deletedKeys).toContain(key)
        expect(mem.store.has(key)).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('rolls back the uploaded object when the state-key upsert fails', async () => {
      upsertImageByStoragePathMock.mockRejectedValueOnce(new Error('db gone'))
      await expect(
        uploadImage(db, {
          kind: { kind: 'category', slug: 'rollback' },
          buffer: jpeg(),
          maxBytes: 1000,
          jpegQuality: 80,
          uploader: null,
        }),
      ).rejects.toThrow(/图片元数据写入失败/)
      const key = 'images/categories/rollback.jpg'
      // The put landed BEFORE the DB write failed, so the rollback must
      // delete it again — otherwise the object leaks on the backend.
      expect(mem.putKeys).toContain(key)
      expect(mem.deletedKeys).toContain(key)
      expect(mem.store.has(key)).toBe(false)
      expect(await allImageRows()).toHaveLength(0)
    })

    it('upserts on the state key for a category kind', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'category', slug: 'my-slug' },
        buffer: jpeg(),
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(dto.storagePath).toBe('images/categories/my-slug.jpg')
      const rows = await allImageRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].storagePath).toBe('images/categories/my-slug.jpg')
    })

    it('re-uploading the same category slug overwrites instead of duplicating', async () => {
      await uploadImage(db, {
        kind: { kind: 'category', slug: 'my-slug' },
        buffer: jpeg(),
        note: 'first',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      await uploadImage(db, {
        kind: { kind: 'category', slug: 'my-slug' },
        buffer: jpeg(),
        note: 'second',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      const rows = await allImageRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].note).toBe('second')
    })

    it('upserts on the state key for a friend kind', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'friend', host: 'example.com' },
        buffer: jpeg(),
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(dto.storagePath).toBe('images/links/example.com.jpg')
      const rows = await allImageRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].storagePath).toBe('images/links/example.com.jpg')
    })
  })

  describe('note normalisation', () => {
    it('trims a note and stores it when non-empty', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        note: '   hello   ',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(dto.note).toBe('hello')
      const rows = await db.select().from(image).where(eq(image.storagePath, dto.storagePath))
      expect(rows[0].note).toBe('hello')
    })

    it('stores null for a whitespace-only note', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        note: '   ',
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(dto.note).toBeNull()
    })

    it('stores null when no note is supplied', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      })
      expect(dto.note).toBeNull()
    })
  })

  describe('uploader plumbing', () => {
    it('persists uploader.id on the row and uploader.name on the DTO', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        uploader: { id: 42, name: 'alice' },
        maxBytes: 1000,
        jpegQuality: 80,
      })
      expect(dto.uploaderId).toBe('42')
      expect(dto.uploaderName).toBe('alice')
      const rows = await db.select().from(image).where(eq(image.storagePath, dto.storagePath))
      expect(rows[0].uploaderId).toBe(42)
    })

    it('persists null uploaderId/name when uploader is absent', async () => {
      const dto = await uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: jpeg(),
        uploader: null,
        maxBytes: 1000,
        jpegQuality: 80,
      })
      expect(dto.uploaderId).toBeNull()
      expect(dto.uploaderName).toBeNull()
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

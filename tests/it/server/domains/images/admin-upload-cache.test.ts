import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { image } from '@/server/infra/db/schema/media'

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

const cache = await import('@/server/domains/images/services/cache')
const adminRead = await import('@/server/domains/images/services/admin-read')
const adminMutate = await import('@/server/domains/images/services/admin-mutate')
const upload = await import('@/server/domains/images/services/upload')
const resolve = await import('@/server/domains/images/services/resolve')
const enhance = await import('@/server/domains/images/services/enhance')

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

async function seedImage(overrides: Partial<typeof image.$inferInsert> = {}) {
  const rows = await db
    .insert(image)
    .values({
      storagePath: overrides.storagePath ?? `images/generic/img-${Math.random().toString(36).slice(2)}.jpg`,
      mimeType: 'image/jpeg',
      width: 1280,
      height: 425,
      byteSize: 0,
      ...overrides,
    })
    .returning()
  return rows[0]
}

describe('images/services/cache — readManyMeta', () => {
  it('returns empty map for empty input', async () => {
    expect(await cache.readManyMeta(db, [])).toEqual(new Map())
  })

  it('returns a map keyed by storage path', async () => {
    await seedImage({ storagePath: 'images/a.jpg' })
    await seedImage({ storagePath: 'images/b.jpg' })

    const map = await cache.readManyMeta(db, ['images/a.jpg', 'images/b.jpg', 'images/none.jpg'])
    expect(map.size).toBe(3)
    expect(map.get('images/a.jpg')!.found).toBe(true)
    expect(map.get('images/b.jpg')!.found).toBe(true)
    expect(map.get('images/none.jpg')!.found).toBe(false)
  })
})

describe('images/services/cache — invalidateImageEnhanceCacheFor', () => {
  it('clears the cached entry', async () => {
    await seedImage({ storagePath: 'images/to-clear.jpg' })
    await cache.readManyMeta(db, ['images/to-clear.jpg'])
    await cache.invalidateImageEnhanceCacheFor(db, 'images/to-clear.jpg')

    await db.delete(image).where(eq(image.storagePath, 'images/to-clear.jpg'))
    const meta = (await cache.readManyMeta(db, ['images/to-clear.jpg'])).get('images/to-clear.jpg')
    expect(meta?.found).toBe(false)
  })
})

describe('images/services/cache — resolveSrcToStoragePath', () => {
  it('returns null for unrelated http url', () => {
    expect(cache.resolveSrcToStoragePath('https://example.com/foo.jpg', null)).toBeNull()
  })

  it('extracts path when src matches publicBaseUrl', () => {
    expect(
      cache.resolveSrcToStoragePath('https://assets.example.com/images/foo.jpg', 'https://assets.example.com'),
    ).toBe('images/foo.jpg')
  })

  it('handles /images/ prefix', () => {
    expect(cache.resolveSrcToStoragePath('/images/foo.jpg', null)).toBe('images/foo.jpg')
  })

  it('handles images/ prefix', () => {
    expect(cache.resolveSrcToStoragePath('images/foo.jpg', null)).toBe('images/foo.jpg')
  })

  it('strips bang transforms', () => {
    expect(cache.resolveSrcToStoragePath('images/foo.jpg!thumbnail', null)).toBe('images/foo.jpg')
  })

  it('handles bare base url', () => {
    expect(cache.resolveSrcToStoragePath('https://assets.example.com', 'https://assets.example.com')).toBe('')
  })
})

describe('images/services/admin-read — listImagesForAdmin', () => {
  it('returns empty when no images', async () => {
    const r = await adminRead.listImagesForAdmin(db, {})
    expect(r.images).toHaveLength(0)
    expect(r.total).toBe(0)
  })

  it('lists images and total', async () => {
    await seedImage({ storagePath: 'images/a.jpg' })
    await seedImage({ storagePath: 'images/b.jpg' })
    const r = await adminRead.listImagesForAdmin(db, { limit: 1 })
    expect(r.images).toHaveLength(1)
    expect(r.total).toBe(2)
    expect(r.hasMore).toBe(true)
  })

  it('filters by kind=category', async () => {
    await seedImage({ storagePath: 'images/categories/a.jpg' })
    await seedImage({ storagePath: 'images/generic/b.jpg' })
    const r = await adminRead.listImagesForAdmin(db, { kind: 'category' })
    expect(r.images).toHaveLength(1)
  })

  it('filters by kind=friend', async () => {
    await seedImage({ storagePath: 'images/links/a.jpg' })
    await seedImage({ storagePath: 'images/generic/b.jpg' })
    const r = await adminRead.listImagesForAdmin(db, { kind: 'friend' })
    expect(r.images).toHaveLength(1)
  })

  it('clamps offset and limit defaults', async () => {
    await seedImage()
    const r = await adminRead.listImagesForAdmin(db, { offset: -1, limit: 0 })
    expect(r.images.length).toBeGreaterThan(0)
  })
})

describe('images/services/admin-read — findImageDtoById', () => {
  it('returns null for unknown id', async () => {
    expect(await adminRead.findImageDtoById(db, 9999)).toBeNull()
  })

  it('returns dto for known id', async () => {
    const img = await seedImage({ storagePath: 'images/byid.jpg' })
    const dto = await adminRead.findImageDtoById(db, img.id)
    expect(dto?.id).toBe(String(img.id))
  })
})

describe('images/services/admin-read — bulkFindImagesByStoragePaths', () => {
  it('returns an empty map for no input', async () => {
    expect(await adminRead.bulkFindImagesByStoragePaths(db, [])).toEqual(new Map())
  })

  it('returns a map keyed by storage path', async () => {
    await seedImage({ storagePath: 'images/x.jpg' })
    const m = await adminRead.bulkFindImagesByStoragePaths(db, ['images/x.jpg', 'images/y.jpg'])
    expect(m.size).toBe(1)
    expect(m.has('images/x.jpg')).toBe(true)
  })
})

describe('images/services/admin-read — toAdminImageDto', () => {
  it('stringifies ids and includes publicUrl', async () => {
    const img = await seedImage({ storagePath: 'images/dto.jpg' })
    const dto = adminRead.toAdminImageDto(img, 'Uploader')
    expect(dto.id).toBe(String(img.id))
    expect(dto.uploaderName).toBe('Uploader')
    expect(dto.publicUrl).toContain('images/dto.jpg')
  })
})

describe('images/services/admin-mutate — updateImageNote', () => {
  it('throws NOT_FOUND for unknown id', async () => {
    await expect(adminMutate.updateImageNote(db, 9999, 'x')).rejects.toThrow(/图片不存在/)
  })

  it('updates the note and returns the dto', async () => {
    const img = await seedImage({ storagePath: 'images/note.jpg', note: 'old' })
    const dto = await adminMutate.updateImageNote(db, img.id, 'new note')
    expect(dto.note).toBe('new note')
  })

  it('clears the note when null is provided', async () => {
    const img = await seedImage({ storagePath: 'images/note.jpg', note: 'old' })
    const dto = await adminMutate.updateImageNote(db, img.id, null)
    expect(dto.note).toBeNull()
  })
})

describe('images/services/admin-mutate — deleteImage', () => {
  it('throws NOT_FOUND for unknown id', async () => {
    await expect(adminMutate.deleteImage(db, 9999)).rejects.toThrow(/图片不存在/)
  })

  it('soft-deletes the image', async () => {
    const img = await seedImage({ storagePath: 'images/delete.jpg' })
    await adminMutate.deleteImage(db, img.id)
    const rows = await db.select().from(image).where(eq(image.id, img.id))
    expect(rows[0].deletedAt).not.toBeNull()
  })
})

describe('images/services/upload — uploadImage', () => {
  it('throws BAD_REQUEST when the buffer is too large', async () => {
    const buf = Buffer.alloc(10)
    await expect(
      upload.uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: buf,
        maxBytes: 1,
        jpegQuality: 80,
        uploader: null,
      }),
    ).rejects.toThrow(/图片体积超过上限/)
  })

  it('throws BAD_REQUEST when mime type is unsupported', async () => {
    const buf = Buffer.alloc(20)
    await expect(
      upload.uploadImage(db, {
        kind: { kind: 'generic' },
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      }),
    ).rejects.toThrow(/不支持的图片格式/)
  })
})

describe('images/services/resolve — resolveImageRef', () => {
  it('returns null for empty src', async () => {
    expect(await resolve.resolveImageRef(db, '')).toBeNull()
  })

  it('returns null for unrelated src', async () => {
    expect(await resolve.resolveImageRef(db, 'https://example.com/x.png')).toBeNull()
  })

  it('returns null for unknown storage path', async () => {
    expect(await resolve.resolveImageRef(db, 'https://assets.example.com/images/none.jpg')).toBeNull()
  })

  it('returns the lookup for a known src', async () => {
    await seedImage({ storagePath: 'images/known.jpg', width: 100, height: 50, thumbhash: 'th' })
    const r = await resolve.resolveImageRef(db, 'https://assets.example.com/images/known.jpg')
    expect(r).not.toBeNull()
    expect(r!.width).toBe(100)
    expect(r!.thumbhash).toBe('th')
  })
})

describe('images/services/resolve — resolveImageRefs', () => {
  it('returns empty map for empty input', async () => {
    expect(await resolve.resolveImageRefs(db, [])).toEqual(new Map())
  })

  it('resolves a batch of urls', async () => {
    await seedImage({ storagePath: 'images/a.jpg', thumbhash: 'ta' })
    await seedImage({ storagePath: 'images/b.jpg', thumbhash: 'tb' })
    const map = await resolve.resolveImageRefs(db, [
      'https://assets.example.com/images/a.jpg',
      'https://assets.example.com/images/b.jpg',
      'https://assets.example.com/images/missing.jpg',
    ])
    expect(map.size).toBe(2)
  })

  it('resolves every distinct URL even when two share one storage path', async () => {
    await seedImage({ storagePath: 'images/a.jpg', thumbhash: 'ta' })
    const map = await resolve.resolveImageRefs(db, ['https://assets.example.com/images/a.jpg', 'images/a.jpg'])
    expect(map.size).toBe(2)
    expect(map.get('images/a.jpg')?.thumbhash).toBe('ta')
  })
})

describe('images/services/enhance — resolveImageMetaBySources', () => {
  it('projects resolved refs to the sparse PT-block meta (dims + thumbhash, no publicUrl)', async () => {
    await seedImage({ storagePath: 'images/a.jpg', width: 10, height: 20, thumbhash: 'th' })
    const m = await enhance.resolveImageMetaBySources(db, ['https://assets.example.com/images/a.jpg'])
    expect(m.get('https://assets.example.com/images/a.jpg')).toEqual({ width: 10, height: 20, thumbhash: 'th' })
  })
})

describe('images/services/enhance — hydrateImageRefs', () => {
  it('calls apply with null when url is empty', async () => {
    const items = [{ cover: '' }]
    const applied: (typeof items)[number][] = []
    await enhance.hydrateImageRefs(
      db,
      items,
      (i) => i.cover,
      (i, lookup) => {
        applied.push(i)
        expect(lookup).toBeNull()
      },
    )
    expect(applied).toHaveLength(1)
  })

  it('calls apply with lookup when resolvable', async () => {
    await seedImage({ storagePath: 'images/h.jpg', width: 1, height: 1 })
    const items = [{ cover: 'https://assets.example.com/images/h.jpg' }]
    await enhance.hydrateImageRefs(
      db,
      items,
      (i) => i.cover,
      (i, lookup) => {
        expect(lookup).not.toBeNull()
        expect(lookup!.width).toBe(1)
      },
    )
  })
})

describe('images/services/upload — UploadKind toKeySpec', () => {
  it('rejects an unknown kind', async () => {
    const buf = Buffer.alloc(20)
    await expect(
      upload.uploadImage(db, {
        kind: { kind: 'unknown' } as never,
        buffer: buf,
        maxBytes: 1000,
        jpegQuality: 80,
        uploader: null,
      }),
    ).rejects.toThrow()
  })
})

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { image } from '@/server/infra/db/schema/media'

const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

const cache = await import('@/server/domains/images/services/cache')
const adminRead = await import('@/server/domains/images/services/admin-read')
const adminMutate = await import('@/server/domains/images/services/admin-mutate')
const upload = await import('@/server/domains/images/services/upload')
const cover = await import('@/server/domains/images/services/cover')
const enhance = await import('@/server/domains/images/services/enhance')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  await flushWorkerRedis()
  await cache.clearImageEnhanceCache()
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

describe('images/services/cache — readMeta', () => {
  it('returns missing when the row does not exist', async () => {
    const meta = await cache.readMeta(db, 'images/none.jpg')
    expect(meta.found).toBe(false)
  })

  it('returns the row when it exists', async () => {
    const img = await seedImage({ storagePath: 'images/found.jpg', width: 800, height: 600, thumbhash: 'hash' })
    const meta = await cache.readMeta(db, 'images/found.jpg')
    expect(meta.found).toBe(true)
    if (meta.found) {
      expect(meta.width).toBe(800)
      expect(meta.height).toBe(600)
      expect(meta.thumbhash).toBe('hash')
      expect(meta.storagePath).toBe('images/found.jpg')
    }
    void img
  })

  it('serves subsequent reads from cache', async () => {
    await seedImage({ storagePath: 'images/cached.jpg' })
    const m1 = await cache.readMeta(db, 'images/cached.jpg')
    expect(m1.found).toBe(true)

    await db.delete(image).where(eq(image.storagePath, 'images/cached.jpg'))
    const m2 = await cache.readMeta(db, 'images/cached.jpg')
    expect(m2.found).toBe(true)
  })
})

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
    await cache.readMeta(db, 'images/to-clear.jpg')
    await cache.invalidateImageEnhanceCacheFor('images/to-clear.jpg')

    await db.delete(image).where(eq(image.storagePath, 'images/to-clear.jpg'))
    const meta = await cache.readMeta(db, 'images/to-clear.jpg')
    expect(meta.found).toBe(false)
  })
})

describe('images/services/cache — resolvePublicUrl', () => {
  it('joins the S3 base url and appends a cache buster', () => {
    const meta = {
      found: true as const,
      storagePath: 'images/x.jpg',
      driver: 's3' as const,
      width: 1,
      height: 1,
      thumbhash: null,
      updatedAtMs: 1000,
    }
    expect(cache.resolvePublicUrl(meta)).toBe('https://assets.example.com/images/x.jpg?v=1000')
  })

  it('resolves a local-driver asset through the /storage route', () => {
    const meta = {
      found: true as const,
      storagePath: 'images/x.jpg',
      driver: 'local' as const,
      width: 1,
      height: 1,
      thumbhash: null,
      updatedAtMs: 1000,
    }
    // Local assets are served from the site origin's /storage/* route.
    expect(cache.resolvePublicUrl(meta)).toMatch(/\/storage\/images\/x\.jpg\?v=1000$/)
  })

  it('strips a leading slash from the storagePath', () => {
    const meta = {
      found: true as const,
      storagePath: '/foo.jpg',
      driver: 's3' as const,
      width: 1,
      height: 1,
      thumbhash: null,
      updatedAtMs: 0,
    }
    expect(cache.resolvePublicUrl(meta)).toBe('https://assets.example.com/foo.jpg?v=0')
  })
})

describe('images/services/cache — buildPublicUrl', () => {
  it('joins base url with storage path for an S3 asset', () => {
    expect(cache.buildPublicUrl('images/foo.jpg', 's3')).toBe('https://assets.example.com/images/foo.jpg')
  })

  it('strips a leading slash from storage path', () => {
    expect(cache.buildPublicUrl('/foo.jpg', 's3')).toBe('https://assets.example.com/foo.jpg')
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
    expect(await adminRead.findImageDtoById(db, 9999n)).toBeNull()
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
    await expect(adminMutate.updateImageNote(db, 9999n, 'x')).rejects.toThrow(/图片不存在/)
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
    await expect(adminMutate.deleteImage(db, 9999n)).rejects.toThrow(/图片不存在/)
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

describe('images/services/cover — loadImageThumbhash', () => {
  it('returns null for empty src', async () => {
    expect(await cover.loadImageThumbhash(db, '')).toBeNull()
  })

  it('returns null for unrelated src', async () => {
    expect(await cover.loadImageThumbhash(db, 'https://example.com/x.png')).toBeNull()
  })

  it('returns null for unknown storage path', async () => {
    expect(await cover.loadImageThumbhash(db, 'https://assets.example.com/images/none.jpg')).toBeNull()
  })

  it('returns the lookup for a known src', async () => {
    await seedImage({ storagePath: 'images/known.jpg', width: 100, height: 50, thumbhash: 'th' })
    const r = await cover.loadImageThumbhash(db, 'https://assets.example.com/images/known.jpg')
    expect(r).not.toBeNull()
    expect(r!.width).toBe(100)
    expect(r!.thumbhash).toBe('th')
  })
})

describe('images/services/cover — loadManyImageThumbhash', () => {
  it('returns empty map for empty input', async () => {
    expect(await cover.loadManyImageThumbhash(db, [])).toEqual(new Map())
  })

  it('resolves a batch of urls', async () => {
    await seedImage({ storagePath: 'images/a.jpg', thumbhash: 'ta' })
    await seedImage({ storagePath: 'images/b.jpg', thumbhash: 'tb' })
    const map = await cover.loadManyImageThumbhash(db, [
      'https://assets.example.com/images/a.jpg',
      'https://assets.example.com/images/b.jpg',
      'https://assets.example.com/images/missing.jpg',
    ])
    expect(map.size).toBe(2)
  })
})

describe('images/services/enhance — resolveImageMetaBySources', () => {
  it('returns empty map for empty input', async () => {
    expect(await enhance.resolveImageMetaBySources(db, [])).toEqual(new Map())
  })

  it('resolves metadata for known sources', async () => {
    await seedImage({ storagePath: 'images/a.jpg', width: 10, height: 20, thumbhash: 'th' })
    const m = await enhance.resolveImageMetaBySources(db, ['https://assets.example.com/images/a.jpg'])
    expect(m.size).toBe(1)
    const meta = m.get('https://assets.example.com/images/a.jpg')
    expect(meta?.width).toBe(10)
    expect(meta?.thumbhash).toBe('th')
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

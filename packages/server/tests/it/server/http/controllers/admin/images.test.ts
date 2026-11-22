import { sqliteOf } from '@kobato/db/database'
import { auditLog } from '@kobato/db/schema/config'
import { image } from '@kobato/db/schema/media'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminImagesRouter } from '@kobato/server/http/controllers/admin/images.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const adminMutate = await import('@kobato/server/domains/images/services/admin-mutate')
const uploadService = await import('@kobato/server/domains/images/services/upload')
const recalculateImageThumbhash = vi.spyOn(adminMutate, 'recalculateImageThumbhash')
const uploadImage = vi.spyOn(uploadService, 'uploadImage')

const db = getTestDb()

const memory = makeMemoryBackend({ driver: 's3' })

const TINY_PNG = new Blob(
  [
    await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } } })
      .png()
      .toBuffer(),
  ],
  {
    type: 'image/png',
  },
)
const TINY_JPEG = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } } })
  .jpeg()
  .toBuffer()

beforeEach(async () => {
  __setStorageBackendForTests('s3', memory.backend)
  vi.clearAllMocks()
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  __resetStorageBackendsForTests()
  memory.reset()
  await flushAuditLog()
  resetAllBatchers()
})

let seq = 0

async function seedAdmin(): Promise<number> {
  const [row] = await sqliteOf(db)
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function seedImage(overrides: Partial<typeof image.$inferInsert> = {}) {
  const [row] = await sqliteOf(db)
    .insert(image)
    .values({
      storagePath: `images/generic/img-${++seq}.jpg`,
      storageDriver: 's3',
      mimeType: 'image/jpeg',
      width: 1280,
      height: 425,
      byteSize: 204800,
      ...overrides,
    })
    .returning()
  return row
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
}

describe('adminImagesRouter.list', () => {
  it('returns seeded images with total and hasMore', async () => {
    const admin = await seedAdmin()
    const seeded = await seedImage({ storagePath: 'images/generic/cat.jpg', uploaderId: admin })

    const res = await call(adminImagesRouter.list, { q: 'cat', kind: 'generic' }, { context: adminCtx(admin) })

    expect(res.images).toHaveLength(1)
    expect(res.images[0]).toMatchObject({
      id: String(seeded.id),
      storagePath: 'images/generic/cat.jpg',
      mimeType: 'image/jpeg',
      uploaderId: String(admin),
      uploaderName: 'Admin',
    })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })
})

describe('adminImagesRouter.delete', () => {
  it('resolves to undefined, soft-deletes the row, removes the stored object, and records an image_deleted audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedImage()
    memory.store.set(seeded.storagePath, { body: Buffer.from('jpg'), contentType: 'image/jpeg' })

    const res = await call(adminImagesRouter.delete, { id: String(seeded.id) }, { context: adminCtx(admin) })

    expect(res).toBeUndefined()

    const [row] = await sqliteOf(db).select().from(image).where(eq(image.id, seeded.id))
    expect(row!.deletedAt).not.toBeNull()
    expect(memory.deletedKeys).toContain(seeded.storagePath)
    expect(memory.store.has(seeded.storagePath)).toBe(false)

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'image_deleted'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('image')
    expect(rows[0]!.resourceId).toBe(String(seeded.id))
    expect(rows[0]!.actorId).toBe(admin)
  })
})

describe('adminImagesRouter.updateNote', () => {
  it('updates the note column and records an image_note_updated audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedImage({ note: 'old' })

    const res = await call(
      adminImagesRouter.updateNote,
      { id: String(seeded.id), note: 'Updated note' },
      { context: adminCtx(admin) },
    )

    expect(res.image.note).toBe('Updated note')
    const [row] = await sqliteOf(db).select().from(image).where(eq(image.id, seeded.id))
    expect(row!.note).toBe('Updated note')

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'image_note_updated'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('image')
    expect(rows[0]!.resourceId).toBe(String(seeded.id))
    expect(rows[0]!.actorId).toBe(admin)
  })
})

describe('adminImagesRouter.recalculateThumbhash', () => {
  it('recalculates a real thumbhash from the stored image bytes', async () => {
    const admin = await seedAdmin()
    const seeded = await seedImage({ storagePath: 'images/generic/tiny.jpg' })
    await memory.backend.put({
      key: 'images/generic/tiny.jpg',
      body: TINY_JPEG,
      contentType: 'image/jpeg',
      visibility: 'public',
    })

    const res = await call(
      adminImagesRouter.recalculateThumbhash,
      { id: String(seeded.id) },
      { context: adminCtx(admin) },
    )

    expect(res.image.id).toBe(String(seeded.id))
    expect(res.image.thumbhash).toMatch(/.+/)
    expect(recalculateImageThumbhash).toHaveBeenCalledOnce()
  })
})

describe('adminImagesRouter.upload', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        upload: { maxBytes: 1024, jpegQuality: 80 },
      },
    })
  })

  it('validates the declared file against the configured cap, then uploads for real', async () => {
    const admin = await seedAdmin()
    const ctx = adminCtx(admin)

    const res = await call(
      adminImagesRouter.upload,
      { file: TINY_PNG, metadata: { kind: 'generic' } },
      { context: ctx },
    )

    expect(res.image.mimeType).toBe('image/jpeg')
    expect(res.image.width).toBe(8)
    expect(res.image.byteSize).toBeLessThanOrEqual(1024)
    expect(uploadImage).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        kind: { kind: 'generic' },
        note: null,
        maxBytes: 1024,
        jpegQuality: 80,
        uploader: { id: admin, name: undefined },
      }),
    )
  })

  it('rejects a declared file over the configured cap before any upload', async () => {
    const admin = await seedAdmin()
    const file = new Blob([new Uint8Array(2048)], { type: 'image/png' })

    await expect(
      call(adminImagesRouter.upload, { file, metadata: { kind: 'generic' } }, { context: adminCtx(admin) }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('routes the category kind with its slug to the domain upload', async () => {
    const admin = await seedAdmin()

    await call(
      adminImagesRouter.upload,
      { file: TINY_PNG, metadata: { kind: 'category', slug: 'tech', note: 'cover' } },
      { context: adminCtx(admin) },
    )

    expect(uploadImage).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ kind: { kind: 'category', slug: 'tech' }, note: 'cover' }),
    )
  })

  it('rejects category/friend kinds for authors (site-global state keys are admin-only)', async () => {
    const author = await sqliteOf(db)
      .insert(user)
      .values({ name: 'Author', email: `author-${++seq}@example.com`, password: 'hashed', role: 'author' })
      .returning({ id: user.id })
    const ctx = makeAuthedCtx({ userId: String(author[0]!.id), role: 'author', db })
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    await expect(
      call(adminImagesRouter.upload, { file, metadata: { kind: 'category', slug: 'tech' } }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call(adminImagesRouter.upload, { file, metadata: { kind: 'friend', host: 'example.com' } }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(uploadImage).not.toHaveBeenCalled()
  })
})

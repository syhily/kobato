import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import * as adminMutate from '@kobato/server/domains/images/services/admin-mutate'
import * as uploadService from '@kobato/server/domains/images/services/upload'
import { adminImagesRouter } from '@kobato/server/http/controllers/admin/images.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { image } from '@kobato/server/infra/db/schema/media'
import { user } from '@kobato/server/infra/db/schema/user'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Worker boundary: recalculateImageThumbhash (storage fetch + sharp worker)
// stays mocked — the sharp pipeline is a native external covered at the
// domain seam. deleteImage now runs REAL: its storage delete goes through
// the registry seam to the in-memory backend below, so `delete` is pinned
// by the object actually disappearing from the store. updateImageNote runs
// real against the in-memory database.
vi.mock('@kobato/server/domains/images/services/admin-mutate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/images/services/admin-mutate')>()
  return {
    ...actual,
    recalculateImageThumbhash: vi.fn(),
  }
})

// Storage + worker boundary: uploadImage (sharp processing + storage put)
// stays mocked — pinned at the domain seam in
// tests/unit/server/domains/images/services/upload.test.ts — while
// assertImageUploadAllowed runs REAL so the cap wiring is exercised.
vi.mock('@kobato/server/domains/images/services/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/images/services/upload')>()
  return {
    ...actual,
    uploadImage: vi.fn(),
  }
})

const db = getTestDb()

// Seeded images carry storageDriver 's3', matching this backend's driver.
const memory = makeMemoryBackend({ driver: 's3' })

beforeEach(async () => {
  __setStorageBackendForTests('s3', memory.backend)
  vi.clearAllMocks()
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  __resetStorageBackendsForTests()
  memory.reset()
  // Flush BEFORE dropping the batcher: InsertBatcher.dispose() leaves an
  // armed flush timer behind, so an unflushed queue would otherwise
  // insert this case's stale events mid-next-test.
  await flushAuditLog()
  resetAllBatchers()
})

let seq = 0

// audit_log.actor_id references user.id, so the admin caller must be a
// real row for the batched audit insert to survive the FK.
async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function seedImage(overrides: Partial<typeof image.$inferInsert> = {}) {
  const [row] = await db
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

// Full adminImageDto-shaped return for the mocked service boundaries.
function imageDto(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
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

    // The real deleteImage ran: the row is soft-deleted and the object is
    // gone from the (in-memory) storage backend.
    const [row] = await db.select().from(image).where(eq(image.id, seeded.id))
    expect(row!.deletedAt).not.toBeNull()
    expect(memory.deletedKeys).toContain(seeded.storagePath)
    expect(memory.store.has(seeded.storagePath)).toBe(false)

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'image_deleted'))
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
    const [row] = await db.select().from(image).where(eq(image.id, seeded.id))
    expect(row!.note).toBe('Updated note')

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'image_note_updated'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('image')
    expect(rows[0]!.resourceId).toBe(String(seeded.id))
    expect(rows[0]!.actorId).toBe(admin)
  })
})

describe('adminImagesRouter.recalculateThumbhash', () => {
  it('returns image with recalculated thumbhash', async () => {
    const admin = await seedAdmin()
    vi.mocked(adminMutate.recalculateImageThumbhash).mockResolvedValueOnce(imageDto())

    const res = await call(adminImagesRouter.recalculateThumbhash, { id: '1' }, { context: adminCtx(admin) })

    expect(res.image.id).toBe('1')
  })
})

describe('adminImagesRouter.upload — orchestration only', () => {
  // The validation rules themselves (MIME allowlist, size cap, magic-byte
  // sniffing) are pinned at the domain seam in
  // tests/unit/server/domains/images/services/upload.test.ts; here we only
  // pin that the controller wires the declared file + settings into the
  // domain and routes the kind dispatch. assertImageUploadAllowed runs
  // real so the configured cap is genuinely enforced.
  beforeEach(() => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        upload: { maxBytes: 1024, jpegQuality: 80 },
      },
    })
  })

  it('validates the declared file against the configured cap, then uploads', async () => {
    const admin = await seedAdmin()
    vi.mocked(uploadService.uploadImage).mockResolvedValueOnce(imageDto())
    const ctx = adminCtx(admin)
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    const res = await call(adminImagesRouter.upload, { file, metadata: { kind: 'generic' } }, { context: ctx })

    expect(res.image.id).toBe('1')
    expect(uploadService.uploadImage).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        kind: { kind: 'generic' },
        note: null,
        maxBytes: 1024,
        jpegQuality: 80,
        // The session stub carries only id + role, so the resolved
        // uploader name is undefined here; the domain maps it to null.
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
    expect(uploadService.uploadImage).not.toHaveBeenCalled()
  })

  it('routes the category kind with its slug to the domain upload', async () => {
    const admin = await seedAdmin()
    vi.mocked(uploadService.uploadImage).mockResolvedValueOnce(imageDto())
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    await call(
      adminImagesRouter.upload,
      { file, metadata: { kind: 'category', slug: 'tech', note: 'cover' } },
      { context: adminCtx(admin) },
    )

    expect(uploadService.uploadImage).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ kind: { kind: 'category', slug: 'tech' }, note: 'cover' }),
    )
  })
})

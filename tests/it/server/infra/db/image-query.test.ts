import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { insertImageIfMissing, upsertImageByStoragePath } from '@/server/infra/db/operations/image'
import { image } from '@/server/infra/db/schema/media'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('db/query/image — upsertImageByStoragePath', () => {
  it('inserts a new row when storage_path is unseen', async () => {
    const result = await upsertImageByStoragePath(db, {
      storagePath: 'images/2026/05/foo.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
      byteSize: 12345,
      thumbhash: 'tt',
      uploaderId: 99,
      note: null,
    })

    expect(result.storagePath).toBe('images/2026/05/foo.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.deletedAt).toBeNull()
  })

  it('updates on conflict and clears deleted_at to resurrect a soft-deleted row', async () => {
    const first = await upsertImageByStoragePath(db, {
      storagePath: 'images/2026/05/bar.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
      byteSize: 12345,
      thumbhash: 'tt',
      uploaderId: 99,
      note: null,
    })

    await db.update(image).set({ deletedAt: new Date() }).where(eq(image.id, first.id))

    const second = await upsertImageByStoragePath(db, {
      storagePath: 'images/2026/05/bar.jpg',
      mimeType: 'image/png',
      width: 200,
      height: 200,
      byteSize: 99999,
      thumbhash: 'xx',
      uploaderId: 88,
      note: 'updated',
    })

    expect(second.id).toBe(first.id)
    expect(second.mimeType).toBe('image/png')
    expect(second.deletedAt).toBeNull()
    expect(second.width).toBe(200)
  })
})

describe('db/query/image — insertImageIfMissing', () => {
  it('returns the new row on a successful insert', async () => {
    const row = await insertImageIfMissing(db, {
      storagePath: 'images/2026/05/unique.jpg',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      byteSize: 0,
      thumbhash: null,
      uploaderId: null,
      note: null,
    })
    expect(row).not.toBeNull()
    expect(row?.storagePath).toBe('images/2026/05/unique.jpg')
  })

  it('returns null when ON CONFLICT DO NOTHING skips the insert', async () => {
    await insertImageIfMissing(db, {
      storagePath: 'images/2026/05/duplicate.jpg',
      mimeType: 'image/jpeg',
      width: 1280,
      height: 425,
      byteSize: 0,
      thumbhash: null,
      uploaderId: null,
      note: null,
    })

    const second = await insertImageIfMissing(db, {
      storagePath: 'images/2026/05/duplicate.jpg',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      byteSize: 1,
      thumbhash: null,
      uploaderId: null,
      note: null,
    })

    expect(second).toBeNull()
  })
})

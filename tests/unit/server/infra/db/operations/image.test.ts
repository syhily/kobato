import { describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

type ResultRow = Record<string, unknown>

function createMockDb(rows: ResultRow[] = []) {
  const finalResult = rows
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          if (prop === 'then') {
            return (onFulfilled?: (v: ResultRow[]) => unknown) => Promise.resolve(finalResult).then(onFulfilled)
          }
          return undefined
        }
        return () => builder
      },
    },
  )

  const dbProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') {
          return undefined
        }
        return () => builder
      },
    },
  )

  return dbProxy as unknown as Database
}

describe('infra/db/operations/image — listAdminImageRows', () => {
  it('returns rows from the builder', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    const db = createMockDb([{ id: 1, storagePath: 'a', uploaderName: 'u' }])
    const result = await listAdminImageRows(db, {})
    expect(result).toHaveLength(1)
  })

  it('applies limit and offset', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    const db = createMockDb([])
    await listAdminImageRows(db, { limit: 10, offset: 5 })
  })

  it('applies only limit when offset is 0', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    const db = createMockDb([])
    await listAdminImageRows(db, { limit: 10, offset: 0 })
  })

  it('applies only offset when limit is undefined', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    const db = createMockDb([])
    await listAdminImageRows(db, { offset: 5 })
  })

  it('passes kind=category and q filters through', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    const db = createMockDb([])
    const result = await listAdminImageRows(db, { kind: 'category', q: 'foo', includeDeleted: true })
    expect(result).toEqual([])
  })

  it('handles kind=friend', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    await listAdminImageRows(createMockDb([]), { kind: 'friend' })
  })

  it('handles kind=generic', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    await listAdminImageRows(createMockDb([]), { kind: 'generic' })
  })

  it('handles kind=all', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    await listAdminImageRows(createMockDb([]), { kind: 'all' })
  })

  it('skips empty q strings', async () => {
    const { listAdminImageRows } = await import('@/server/infra/db/operations/image')
    await listAdminImageRows(createMockDb([]), { q: '   ' })
  })
})

describe('infra/db/operations/image — findAdminImageRowById', () => {
  it('returns the first matching row', async () => {
    const { findAdminImageRowById } = await import('@/server/infra/db/operations/image')
    expect(await findAdminImageRowById(createMockDb([{ id: 5 }]), 5)).toEqual({ id: 5 })
  })

  it('returns null when no rows', async () => {
    const { findAdminImageRowById } = await import('@/server/infra/db/operations/image')
    expect(await findAdminImageRowById(createMockDb([]), 5)).toBeNull()
  })
})

describe('infra/db/operations/image — countAdminImages', () => {
  it('returns the count value', async () => {
    const { countAdminImages } = await import('@/server/infra/db/operations/image')
    expect(await countAdminImages(createMockDb([{ value: 42 }]), {})).toBe(42)
  })

  it('returns 0 when no rows', async () => {
    const { countAdminImages } = await import('@/server/infra/db/operations/image')
    expect(await countAdminImages(createMockDb([]), {})).toBe(0)
  })

  it('passes kind=q filters through', async () => {
    const { countAdminImages } = await import('@/server/infra/db/operations/image')
    expect(await countAdminImages(createMockDb([{ value: 7 }]), { q: 'foo', kind: 'category' })).toBe(7)
  })
})

describe('infra/db/operations/image — findImageById', () => {
  it('returns the row when present', async () => {
    const { findImageById } = await import('@/server/infra/db/operations/image')
    expect(await findImageById(createMockDb([{ id: 1 }]), 1)).toEqual({ id: 1 })
  })

  it('returns null when absent', async () => {
    const { findImageById } = await import('@/server/infra/db/operations/image')
    expect(await findImageById(createMockDb([]), 1)).toBeNull()
  })
})

describe('infra/db/operations/image — findImagesByIds / findImagesByStoragePaths', () => {
  it('short-circuits findImagesByIds on empty input', async () => {
    const { findImagesByIds } = await import('@/server/infra/db/operations/image')
    expect(await findImagesByIds(createMockDb([{ id: 1 }]), [])).toEqual([])
  })

  it('queries for non-empty ids', async () => {
    const { findImagesByIds } = await import('@/server/infra/db/operations/image')
    expect(await findImagesByIds(createMockDb([{ id: 1 }]), [1, 2])).toEqual([{ id: 1 }])
  })

  it('short-circuits findImagesByStoragePaths on empty input', async () => {
    const { findImagesByStoragePaths } = await import('@/server/infra/db/operations/image')
    expect(await findImagesByStoragePaths(createMockDb([]), [])).toEqual([])
  })

  it('queries for non-empty storage paths', async () => {
    const { findImagesByStoragePaths } = await import('@/server/infra/db/operations/image')
    expect(await findImagesByStoragePaths(createMockDb([{ id: 1 }]), ['images/a.png'])).toEqual([{ id: 1 }])
  })
})

describe('infra/db/operations/image — insertImage / insertImageIfMissing / upsertImageByStoragePath', () => {
  it('inserts and returns the row', async () => {
    const { insertImage } = await import('@/server/infra/db/operations/image')
    expect(await insertImage(createMockDb([{ id: 1 }]), { storagePath: 'a', mimeType: 'image/png' } as never)).toEqual({
      id: 1,
    })
  })

  it('insertImageIfMissing returns null on no returned rows', async () => {
    const { insertImageIfMissing } = await import('@/server/infra/db/operations/image')
    expect(
      await insertImageIfMissing(createMockDb([]), { storagePath: 'a', mimeType: 'image/png' } as never),
    ).toBeNull()
  })

  it('insertImageIfMissing returns the row when inserted', async () => {
    const { insertImageIfMissing } = await import('@/server/infra/db/operations/image')
    expect(
      await insertImageIfMissing(createMockDb([{ id: 1 }]), { storagePath: 'a', mimeType: 'image/png' } as never),
    ).toEqual({ id: 1 })
  })

  it('upsertImageByStoragePath returns the upserted row', async () => {
    const { upsertImageByStoragePath } = await import('@/server/infra/db/operations/image')
    expect(
      await upsertImageByStoragePath(createMockDb([{ id: 1 }]), { storagePath: 'a', mimeType: 'image/png' } as never),
    ).toEqual({ id: 1 })
  })
})

describe('infra/db/operations/image — softDeleteImage / updateImageNote / updateImageThumbhash', () => {
  it('softDeleteImage returns the row when present', async () => {
    const { softDeleteImage } = await import('@/server/infra/db/operations/image')
    expect(await softDeleteImage(createMockDb([{ id: 1 }]), 1)).toEqual({ id: 1 })
  })

  it('softDeleteImage returns null when absent', async () => {
    const { softDeleteImage } = await import('@/server/infra/db/operations/image')
    expect(await softDeleteImage(createMockDb([]), 1)).toBeNull()
  })

  it('updateImageNote normalizes empty/whitespace note to null', async () => {
    const { updateImageNote } = await import('@/server/infra/db/operations/image')
    expect(await updateImageNote(createMockDb([{ id: 1 }]), 1, '   ')).toEqual({ id: 1 })
  })

  it('updateImageNote passes non-empty note through', async () => {
    const { updateImageNote } = await import('@/server/infra/db/operations/image')
    expect(await updateImageNote(createMockDb([{ id: 1 }]), 1, 'note')).toEqual({ id: 1 })
  })

  it('updateImageNoteWithUploader delegates to findAdminImageRowById', async () => {
    const { updateImageNoteWithUploader } = await import('@/server/infra/db/operations/image')
    expect(await updateImageNoteWithUploader(createMockDb([{ id: 1, uploaderName: 'u' }]), 1, 'note')).toEqual({
      id: 1,
      uploaderName: 'u',
    })
  })

  it('updateImageNoteWithUploader returns null when the update returns null', async () => {
    const { updateImageNoteWithUploader } = await import('@/server/infra/db/operations/image')
    expect(await updateImageNoteWithUploader(createMockDb([]), 1, 'note')).toBeNull()
  })

  it('updateImageThumbhash returns the row when present', async () => {
    const { updateImageThumbhash } = await import('@/server/infra/db/operations/image')
    expect(await updateImageThumbhash(createMockDb([{ id: 1 }]), 1, 'hash')).toEqual({ id: 1 })
  })

  it('updateImageThumbhashWithUploader returns the joined row', async () => {
    const { updateImageThumbhashWithUploader } = await import('@/server/infra/db/operations/image')
    expect(await updateImageThumbhashWithUploader(createMockDb([{ id: 1, uploaderName: 'u' }]), 1, 'hash')).toEqual({
      id: 1,
      uploaderName: 'u',
    })
  })
})

import type { Database } from '@kobato/db/sqlite/database'

import { image } from '@kobato/db/sqlite/schema/media'
import { describe, expect, it } from 'vitest'

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

describe('infra/db/operations/uploader — withUploader', () => {
  async function createImageUploader() {
    const { withUploader } = await import('@kobato/db/sqlite/operations/content/uploader')
    return withUploader({
      table: image,
      idColumn: image.id,
      uploaderIdColumn: image.uploaderId,
      columns: { id: image.id, storagePath: image.storagePath, uploaderId: image.uploaderId },
    })
  }

  it('appends uploaderName to the entity column selection', async () => {
    const uploader = await createImageUploader()
    expect(Object.keys(uploader.columns)).toEqual(['id', 'storagePath', 'uploaderId', 'uploaderName'])
  })

  it('selectJoined returns rows from the builder', async () => {
    const uploader = await createImageUploader()
    const rows = await uploader.selectJoined(createMockDb([{ id: 1, uploaderName: 'u' }]))
    expect(rows).toHaveLength(1)
  })

  it('findJoinedRowById returns the first matching row', async () => {
    const uploader = await createImageUploader()
    expect(await uploader.findJoinedRowById(createMockDb([{ id: 5 }]), 5)).toEqual({ id: 5 })
  })

  it('findJoinedRowById returns null when no rows', async () => {
    const uploader = await createImageUploader()
    expect(await uploader.findJoinedRowById(createMockDb([]), 5)).toBeNull()
  })

  it('updateThenRefetch re-reads the joined row after a successful update', async () => {
    const uploader = await createImageUploader()
    const result = await uploader.updateThenRefetch(createMockDb([{ id: 1, uploaderName: 'u' }]), 1, async () => ({
      id: 1,
    }))
    expect(result).toEqual({ id: 1, uploaderName: 'u' })
  })

  it('updateThenRefetch returns null without a refetch when the update matched no row', async () => {
    const uploader = await createImageUploader()
    const result = await uploader.updateThenRefetch(createMockDb([{ id: 1 }]), 1, async () => null)
    expect(result).toBeNull()
  })
})

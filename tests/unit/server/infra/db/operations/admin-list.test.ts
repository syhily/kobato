import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { SQL, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { image } from '@/server/infra/db/schema/media'

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

  return dbProxy as unknown as NodePgDatabase
}

// A stand-in for the Drizzle select tail that records the pagination
// calls `applyPage` makes, and resolves `rows` when awaited.
function createFakeQuery<TRow>(rows: TRow[]) {
  const calls: Array<[string, number]> = []
  const query = {
    limit(count: number) {
      calls.push(['limit', count])
      return query
    },
    offset(count: number) {
      calls.push(['offset', count])
      return query
    },
    then(onFulfilled?: (v: TRow[]) => unknown) {
      return Promise.resolve(rows).then(onFulfilled)
    },
  }
  return {
    query: query as unknown as Parameters<typeof import('@/server/infra/db/operations/admin-list').applyPage>[0],
    calls,
  }
}

describe('infra/db/operations/admin-list — assembleWhere', () => {
  it('returns undefined for an empty conditions array', async () => {
    const { assembleWhere } = await import('@/server/infra/db/operations/admin-list')
    expect(assembleWhere([])).toBeUndefined()
  })

  it('returns the single condition verbatim', async () => {
    const { assembleWhere } = await import('@/server/infra/db/operations/admin-list')
    const condition = isNull(image.deletedAt)
    expect(assembleWhere([condition])).toBe(condition)
  })

  it('wraps multiple conditions in a conjunction', async () => {
    const { assembleWhere } = await import('@/server/infra/db/operations/admin-list')
    const result = assembleWhere([isNull(image.deletedAt), isNull(image.updatedAt)])
    expect(result).toBeInstanceOf(SQL)
  })
})

describe('infra/db/operations/admin-list — applyPage', () => {
  it('returns rows from the builder untouched when no page is given', async () => {
    const { applyPage } = await import('@/server/infra/db/operations/admin-list')
    const { query, calls } = createFakeQuery([{ id: 1n }])
    expect(await applyPage(query, {})).toEqual([{ id: 1n }])
    expect(calls).toEqual([])
  })

  it('applies limit and offset', async () => {
    const { applyPage } = await import('@/server/infra/db/operations/admin-list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { limit: 10, offset: 5 })
    expect(calls).toEqual([
      ['limit', 10],
      ['offset', 5],
    ])
  })

  it('applies only limit when offset is 0', async () => {
    const { applyPage } = await import('@/server/infra/db/operations/admin-list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { limit: 10, offset: 0 })
    expect(calls).toEqual([['limit', 10]])
  })

  it('applies only offset when limit is undefined', async () => {
    const { applyPage } = await import('@/server/infra/db/operations/admin-list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { offset: 5 })
    expect(calls).toEqual([['offset', 5]])
  })

  it('ignores a non-positive offset on its own', async () => {
    const { applyPage } = await import('@/server/infra/db/operations/admin-list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { offset: 0 })
    expect(calls).toEqual([])
  })
})

describe('infra/db/operations/admin-list — withUploader', () => {
  async function createImageUploader() {
    const { withUploader } = await import('@/server/infra/db/operations/admin-list')
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
    const rows = await uploader.selectJoined(createMockDb([{ id: 1n, uploaderName: 'u' }]))
    expect(rows).toHaveLength(1)
  })

  it('findJoinedRowById returns the first matching row', async () => {
    const uploader = await createImageUploader()
    expect(await uploader.findJoinedRowById(createMockDb([{ id: 5n }]), 5n)).toEqual({ id: 5n })
  })

  it('findJoinedRowById returns null when no rows', async () => {
    const uploader = await createImageUploader()
    expect(await uploader.findJoinedRowById(createMockDb([]), 5n)).toBeNull()
  })

  it('updateThenRefetch re-reads the joined row after a successful update', async () => {
    const uploader = await createImageUploader()
    const result = await uploader.updateThenRefetch(createMockDb([{ id: 1n, uploaderName: 'u' }]), 1n, async () => ({
      id: 1n,
    }))
    expect(result).toEqual({ id: 1n, uploaderName: 'u' })
  })

  it('updateThenRefetch returns null without a refetch when the update matched no row', async () => {
    const uploader = await createImageUploader()
    const result = await uploader.updateThenRefetch(createMockDb([{ id: 1n }]), 1n, async () => null)
    expect(result).toBeNull()
  })
})

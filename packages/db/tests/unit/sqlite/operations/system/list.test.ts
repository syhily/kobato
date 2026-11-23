import { image } from '@kobato/db/sqlite/schema/media'
import { SQL, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

function createFakeQuery(rows: unknown[]) {
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
    then(onFulfilled?: (v: unknown[]) => unknown) {
      return Promise.resolve(rows).then(onFulfilled)
    },
  }
  return {
    query: query as unknown as Parameters<typeof import('@kobato/db/sqlite/operations/system/list').applyPage>[0],
    calls,
  }
}

describe('infra/db/operations/list — assembleWhere', () => {
  it('returns undefined for an empty conditions array', async () => {
    const { assembleWhere } = await import('@kobato/db/sqlite/operations/system/list')
    expect(assembleWhere([])).toBeUndefined()
  })

  it('returns the single condition verbatim', async () => {
    const { assembleWhere } = await import('@kobato/db/sqlite/operations/system/list')
    const condition = isNull(image.deletedAt)
    expect(assembleWhere([condition])).toBe(condition)
  })

  it('wraps multiple conditions in a conjunction', async () => {
    const { assembleWhere } = await import('@kobato/db/sqlite/operations/system/list')
    const result = assembleWhere([isNull(image.deletedAt), isNull(image.updatedAt)])
    expect(result).toBeInstanceOf(SQL)
  })
})

describe('infra/db/operations/list — applyPage', () => {
  it('returns rows from the builder untouched when no page is given', async () => {
    const { applyPage } = await import('@kobato/db/sqlite/operations/system/list')
    const { query, calls } = createFakeQuery([{ id: 1 }])
    expect(await applyPage(query, {})).toEqual([{ id: 1 }])
    expect(calls).toEqual([])
  })

  it('applies limit and offset', async () => {
    const { applyPage } = await import('@kobato/db/sqlite/operations/system/list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { limit: 10, offset: 5 })
    expect(calls).toEqual([
      ['limit', 10],
      ['offset', 5],
    ])
  })

  it('applies only limit when offset is 0', async () => {
    const { applyPage } = await import('@kobato/db/sqlite/operations/system/list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { limit: 10, offset: 0 })
    expect(calls).toEqual([['limit', 10]])
  })

  it('applies only offset when limit is undefined', async () => {
    const { applyPage } = await import('@kobato/db/sqlite/operations/system/list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { offset: 5 })
    expect(calls).toEqual([['offset', 5]])
  })

  it('ignores a non-positive offset on its own', async () => {
    const { applyPage } = await import('@kobato/db/sqlite/operations/system/list')
    const { query, calls } = createFakeQuery([])
    await applyPage(query, { offset: 0 })
    expect(calls).toEqual([])
  })
})

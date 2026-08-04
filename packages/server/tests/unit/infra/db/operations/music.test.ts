import type { Database } from '@kobato/server/infra/db/database'

import { describe, expect, it } from 'vitest'

type ResultRow = Record<string, unknown>

function createMockDb(rows: ResultRow[] = []) {
  const finalResult = rows
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled?: (v: ResultRow[]) => unknown) => Promise.resolve(finalResult).then(onFulfilled)
        }
        if (prop === 'catch' || prop === 'finally') {
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

describe('infra/db/operations/music — listAdminMusicRows', () => {
  it('returns rows from the builder', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    expect(await listAdminMusicRows(createMockDb([{ id: 1 }]), {})).toHaveLength(1)
  })

  it('applies limit and offset', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    await listAdminMusicRows(createMockDb([]), { limit: 10, offset: 5 })
  })

  it('applies only limit when offset is 0', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    await listAdminMusicRows(createMockDb([]), { limit: 10, offset: 0 })
  })

  it('applies only offset when limit is undefined', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    await listAdminMusicRows(createMockDb([]), { offset: 5 })
  })

  it('passes q and includeDeleted filters', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    await listAdminMusicRows(createMockDb([]), { q: 'song', includeDeleted: true })
  })

  it('skips empty q strings', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    await listAdminMusicRows(createMockDb([]), { q: '  ' })
  })

  it('honours sortBy / sortOrder', async () => {
    const { listAdminMusicRows } = await import('@kobato/server/infra/db/operations/music')
    for (const sortBy of ['createdAt', 'updatedAt', 'name', 'artist', 'album'] as const) {
      for (const sortOrder of ['asc', 'desc'] as const) {
        await listAdminMusicRows(createMockDb([]), { sortBy, sortOrder })
      }
    }
  })
})

describe('infra/db/operations/music — findAdminMusicRowById', () => {
  it('returns the first matching row', async () => {
    const { findAdminMusicRowById } = await import('@kobato/server/infra/db/operations/music')
    expect(await findAdminMusicRowById(createMockDb([{ id: 5 }]), 5)).toEqual({ id: 5 })
  })

  it('returns null when no rows', async () => {
    const { findAdminMusicRowById } = await import('@kobato/server/infra/db/operations/music')
    expect(await findAdminMusicRowById(createMockDb([]), 5)).toBeNull()
  })
})

describe('infra/db/operations/music — countAdminMusic', () => {
  it('returns the count value', async () => {
    const { countAdminMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await countAdminMusic(createMockDb([{ value: 9 }]), {})).toBe(9)
  })

  it('returns 0 when no rows', async () => {
    const { countAdminMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await countAdminMusic(createMockDb([]), {})).toBe(0)
  })

  it('passes q filter', async () => {
    const { countAdminMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await countAdminMusic(createMockDb([{ value: 3 }]), { q: 'song' })).toBe(3)
  })
})

describe('infra/db/operations/music — single-row lookups', () => {
  it('findMusicById returns the row when present', async () => {
    const { findMusicById } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicById(createMockDb([{ id: 1 }]), 1)).toEqual({ id: 1 })
  })

  it('findMusicById returns null when absent', async () => {
    const { findMusicById } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicById(createMockDb([]), 1)).toBeNull()
  })

  it('findMusicByPlayerId returns the row when present', async () => {
    const { findMusicByPlayerId } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicByPlayerId(createMockDb([{ playerId: 'p1' }]), 'p1')).toEqual({ playerId: 'p1' })
  })

  it('findMusicByPlayerId returns null when absent', async () => {
    const { findMusicByPlayerId } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicByPlayerId(createMockDb([]), 'p1')).toBeNull()
  })

  it('findMusicBySourceAndId returns the row when present', async () => {
    const { findMusicBySourceAndId } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicBySourceAndId(createMockDb([{ id: 1 }]), 'netease', 'abc')).toEqual({ id: 1 })
  })

  it('findMusicBySourceAndId returns null when absent', async () => {
    const { findMusicBySourceAndId } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicBySourceAndId(createMockDb([]), 'netease', 'abc')).toBeNull()
  })
})

describe('infra/db/operations/music — findMusicByPlayerIds', () => {
  it('short-circuits on empty input', async () => {
    const { findMusicByPlayerIds } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicByPlayerIds(createMockDb([{ id: 1 }]), [])).toEqual([])
  })

  it('queries for a single playerId', async () => {
    const { findMusicByPlayerIds } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicByPlayerIds(createMockDb([{ id: 1 }]), ['p1'])).toEqual([{ id: 1 }])
  })

  it('queries for multiple playerIds', async () => {
    const { findMusicByPlayerIds } = await import('@kobato/server/infra/db/operations/music')
    expect(await findMusicByPlayerIds(createMockDb([{ id: 1 }]), ['p1', 'p2'])).toEqual([{ id: 1 }])
  })
})

describe('infra/db/operations/music — insertMusic / updateMusic / softDeleteMusic', () => {
  it('inserts and returns the row', async () => {
    const { insertMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await insertMusic(createMockDb([{ id: 1 }]), { playerId: 'p' } as never)).toEqual({ id: 1 })
  })

  it('updateMusic returns the row when present', async () => {
    const { updateMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await updateMusic(createMockDb([{ id: 1 }]), 1, { name: 'x' } as never)).toEqual({ id: 1 })
  })

  it('updateMusic returns null when absent', async () => {
    const { updateMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await updateMusic(createMockDb([]), 1, { name: 'x' } as never)).toBeNull()
  })

  it('softDeleteMusic returns the row when present', async () => {
    const { softDeleteMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await softDeleteMusic(createMockDb([{ id: 1 }]), 1)).toEqual({ id: 1 })
  })

  it('softDeleteMusic returns null when absent', async () => {
    const { softDeleteMusic } = await import('@kobato/server/infra/db/operations/music')
    expect(await softDeleteMusic(createMockDb([]), 1)).toBeNull()
  })
})

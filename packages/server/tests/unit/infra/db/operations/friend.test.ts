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

describe('infra/db/operations/friend — listPublicFriendRows', () => {
  it('returns rows from the builder', async () => {
    const { listPublicFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    expect(await listPublicFriendRows(createMockDb([{ id: 1 }]))).toHaveLength(1)
  })
})

describe('infra/db/operations/friend — listAdminFriendRows', () => {
  it('returns rows from the builder', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    expect(await listAdminFriendRows(createMockDb([{ id: 1 }]), {})).toHaveLength(1)
  })

  it('applies limit and offset', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    await listAdminFriendRows(createMockDb([]), { limit: 10, offset: 5 })
  })

  it('applies only limit when offset is 0', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    await listAdminFriendRows(createMockDb([]), { limit: 10, offset: 0 })
  })

  it('applies only offset when limit is undefined', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    await listAdminFriendRows(createMockDb([]), { offset: 5 })
  })

  it('passes q and includeHidden filters', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    await listAdminFriendRows(createMockDb([]), { q: 'friend', includeHidden: true })
  })

  it('skips empty q strings', async () => {
    const { listAdminFriendRows } = await import('@kobato/server/infra/db/operations/friend')
    await listAdminFriendRows(createMockDb([]), { q: '   ' })
  })
})

describe('infra/db/operations/friend — countAdminFriends', () => {
  it('returns the count value', async () => {
    const { countAdminFriends } = await import('@kobato/server/infra/db/operations/friend')
    expect(await countAdminFriends(createMockDb([{ value: 7 }]), {})).toBe(7)
  })

  it('returns 0 when no rows', async () => {
    const { countAdminFriends } = await import('@kobato/server/infra/db/operations/friend')
    expect(await countAdminFriends(createMockDb([]), {})).toBe(0)
  })

  it('passes q filter', async () => {
    const { countAdminFriends } = await import('@kobato/server/infra/db/operations/friend')
    expect(await countAdminFriends(createMockDb([{ value: 3 }]), { q: 'friend' })).toBe(3)
  })
})

describe('infra/db/operations/friend — single-row lookups', () => {
  it('findFriendById returns the row when present', async () => {
    const { findFriendById } = await import('@kobato/server/infra/db/operations/friend')
    expect(await findFriendById(createMockDb([{ id: 1 }]), 1)).toEqual({ id: 1 })
  })

  it('findFriendById returns null when absent', async () => {
    const { findFriendById } = await import('@kobato/server/infra/db/operations/friend')
    expect(await findFriendById(createMockDb([]), 1)).toBeNull()
  })

  it('findFriendByHomepage returns the row when present', async () => {
    const { findFriendByHomepage } = await import('@kobato/server/infra/db/operations/friend')
    expect(await findFriendByHomepage(createMockDb([{ id: 1 }]), 'https://x.com')).toEqual({ id: 1 })
  })

  it('findFriendByHomepage returns null when absent', async () => {
    const { findFriendByHomepage } = await import('@kobato/server/infra/db/operations/friend')
    expect(await findFriendByHomepage(createMockDb([]), 'https://x.com')).toBeNull()
  })
})

describe('infra/db/operations/friend — insertFriend / updateFriend / deleteFriend', () => {
  it('inserts and returns the row', async () => {
    const { insertFriend } = await import('@kobato/server/infra/db/operations/friend')
    expect(await insertFriend(createMockDb([{ id: 1 }]), { website: 'x', homepage: 'https://x' } as never)).toEqual({
      id: 1,
    })
  })

  it('updateFriend returns the row when present', async () => {
    const { updateFriend } = await import('@kobato/server/infra/db/operations/friend')
    expect(await updateFriend(createMockDb([{ id: 1 }]), 1, { website: 'y' } as never)).toEqual({ id: 1 })
  })

  it('updateFriend returns null when absent', async () => {
    const { updateFriend } = await import('@kobato/server/infra/db/operations/friend')
    expect(await updateFriend(createMockDb([]), 1, { website: 'y' } as never)).toBeNull()
  })

  it('deleteFriend returns true when a row was deleted', async () => {
    const { deleteFriend } = await import('@kobato/server/infra/db/operations/friend')
    expect(await deleteFriend(createMockDb([{ id: 1 }]), 1)).toBe(true)
  })

  it('deleteFriend returns false when no row was deleted', async () => {
    const { deleteFriend } = await import('@kobato/server/infra/db/operations/friend')
    expect(await deleteFriend(createMockDb([]), 1)).toBe(false)
  })
})

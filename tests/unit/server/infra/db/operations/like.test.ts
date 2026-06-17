import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeQuery {
  rows: unknown[] = []
  private resolveValue: unknown | null = null

  select() {
    return this
  }
  insert() {
    return this
  }
  update() {
    return this
  }
  delete() {
    return this
  }
  from() {
    return this
  }
  where() {
    return this
  }
  limit() {
    return this
  }
  groupBy() {
    return this
  }
  inArray() {
    return this
  }
  set() {
    return this
  }
  values(values: unknown) {
    this.resolveValue = Array.isArray(values) ? values[0] : values
    return this
  }
  returning() {
    return this
  }

  withRows(rows: unknown[]) {
    this.rows = rows
    return this
  }

  then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
    if (this.resolveValue !== null) {
      const val = this.resolveValue
      this.resolveValue = null
      return Promise.resolve([val]).then(resolve, reject)
    }
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(rows: unknown[] = []): NodePgDatabase {
  const query = new FakeQuery().withRows(rows)
  return {
    select: () => query.select(),
    insert: () => query.insert(),
    update: () => query.update(),
    delete: () => query.delete(),
    transaction: async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(fakeDb(rows) as NodePgDatabase),
  } as unknown as NodePgDatabase
}

import {
  commentCountsByOwnerIds,
  consumeActiveLikeToken,
  existsActiveLikeToken,
  metricVoteUp,
  metricsByOwnerIds,
  purgeOldLikeTokens,
  recordLikeAndCount,
} from '@/server/infra/db/operations/like'

describe('like operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records a like and returns the new count', async () => {
    const db = fakeDb([{ voteUp: 5 }])
    const count = await recordLikeAndCount(db, 'token', { type: 'post', ownerId: 1n })
    expect(count).toBe(5)
  })

  it('consumes an active like token', async () => {
    const db = fakeDb([{ id: 1n }])
    const consumed = await consumeActiveLikeToken(db, { type: 'post', ownerId: 1n }, 'token')
    expect(consumed).toBe(true)
  })

  it('returns false when no token is consumed', async () => {
    const db = fakeDb([])
    const consumed = await consumeActiveLikeToken(db, { type: 'post', ownerId: 1n }, 'token')
    expect(consumed).toBe(false)
  })

  it('reads the current vote-up count', async () => {
    const db = fakeDb([{ like: 10 }])
    const count = await metricVoteUp(db, { type: 'post', ownerId: 1n })
    expect(count).toBe(10)
  })

  it('returns metrics by owner ids', async () => {
    const db = fakeDb([{ type: 'post', ownerId: 1n, publicId: 'p1', like: 5, view: 100 }])
    const rows = await metricsByOwnerIds(db, 'post', [1n])
    expect(rows).toHaveLength(1)
    expect(rows[0].like).toBe(5)
  })

  it('returns empty metrics for empty owner ids', async () => {
    const db = fakeDb()
    const rows = await metricsByOwnerIds(db, 'post', [])
    expect(rows).toHaveLength(0)
  })

  it('returns comment counts by owner ids', async () => {
    const db = fakeDb([{ ownerId: 1n, count: 3 }])
    const rows = await commentCountsByOwnerIds(db, 'post', [1n])
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(3)
  })

  it('returns empty comment counts for empty owner ids', async () => {
    const db = fakeDb()
    const rows = await commentCountsByOwnerIds(db, 'post', [])
    expect(rows).toHaveLength(0)
  })

  it('purges old like tokens', async () => {
    const db = fakeDb()
    await expect(purgeOldLikeTokens(db, new Date())).resolves.toBeUndefined()
  })

  it('checks whether an active like token exists', async () => {
    const db = fakeDb([{ id: 1n }])
    const exists = await existsActiveLikeToken(db, { type: 'post', ownerId: 1n }, 'token')
    expect(exists).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { createDbPool, closePool } from '@/server/infra/db/pool'

describe('infra/db/pool', () => {
  describe('createDbPool', () => {
    it('returns { db, pool } with non-null values', () => {
      const result = createDbPool()
      expect(result.db).toBeDefined()
      expect(result.pool).toBeDefined()
    })

    it('creates independent instances on each call', () => {
      const a = createDbPool()
      const b = createDbPool()
      expect(a.db).not.toBe(b.db)
      expect(a.pool).not.toBe(b.pool)
    })
  })

  describe('closePool', () => {
    it('closes an open pool without error', async () => {
      const { pool } = createDbPool()
      await expect(closePool(pool)).resolves.toBeUndefined()
    })

    it('is a no-op when called twice on the same pool', async () => {
      const { pool } = createDbPool()
      await closePool(pool)
      await expect(closePool(pool)).resolves.toBeUndefined()
    })
  })
})

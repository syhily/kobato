import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { emptySession } from '#/_helpers/session'
import { signUpInitialAdminWithSession } from '@/server/domains/auth/flows'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

describe('install snapshot debug', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    await flushWorkerRedis()
  })

  it('should seed settings and update snapshot', async () => {
    const session = emptySession()
    const request = new Request('http://localhost/admin/setup', { method: 'POST' })

    const result = await signUpInitialAdminWithSession(db, pool, {
      title: 'My Blog',
      name: 'Admin',
      email: 'admin@example.com',
      password: 'correcthorsebatterystaple',
      session,
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(true)

    const bundle = getBlogSettingsBundleSync()
    if (bundle) {
      expect(bundle.siteIdentity?.title).toBe('My Blog')
    }
    expect(bundle).not.toBeNull()
    expect(bundle?.siteIdentity?.title).toBe('My Blog')
  })
})

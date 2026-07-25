import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { createDbPool, closePool } from '@/server/infra/db/pool'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin pages', () => {
  it('creates a page via upsert-meta and lists it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

    const createRes = await callRpc(
      '/admin/pages/upsertMeta',
      {
        title: 'About Us',
        summary: '',
        slug: 'about',
      },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ page: { id: string; slug: string; title: string } }>(createRes)
    expect(created.page.title).toBe('About Us')
    expect(created.page.slug).toBe('about')

    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 10 }, ctx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{
      pages: { id: string; title: string }[]
      total: number
      hasMore: boolean
    }>(listRes)
    expect(list.total).toBe(1)
    expect(list.pages[0]?.title).toBe('About Us')
  })

  it('rejects unauthenticated list requests', async () => {
    const ctx = makePublicCtx({ db, pool })
    const res = await callRpc('/admin/pages/list', { offset: 0, limit: 10 }, ctx)
    expect(res.status).toBe(401)
  })
})

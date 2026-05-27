import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createDbPool, closePool } from '@/server/infra/db/pool'

import { clearAllTables } from '../_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '../_helpers/mock-ctx'
import { callRpc, parseRpcJson } from './_helpers/rpc-call'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  const { redisInstance } = await import('@/server/infra/redis/storage')
  await redisInstance().flushdb()
})

describe('integration / admin posts', () => {
  it('creates a post via upsert-meta and lists it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

    const createRes = await callRpc(
      '/admin/posts/upsertMeta',
      {
        title: 'Hello Integration',
        summary: '',
        tags: [],
      },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ post: { id: string; slug: string; title: string } }>(createRes)
    expect(created.post.title).toBe('Hello Integration')
    expect(created.post.slug).toBe('hello-integration')

    const listRes = await callRpc('/admin/posts/list', { offset: 0, limit: 10 }, ctx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{
      posts: { id: string; title: string }[]
      total: number
      hasMore: boolean
    }>(listRes)
    expect(list.total).toBe(1)
    expect(list.posts[0]?.title).toBe('Hello Integration')
  })

  it('rejects unauthenticated list requests', async () => {
    const ctx = makePublicCtx({ db, pool })
    const res = await callRpc('/admin/posts/list', { offset: 0, limit: 10 }, ctx)
    expect(res.status).toBe(401)
  })
})

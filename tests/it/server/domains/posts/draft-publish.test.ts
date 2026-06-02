import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
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
  const { redisInstance } = await import('@/server/infra/redis/storage')
  await redisInstance().flushdb()
})

describe('integration / draft publish flow', () => {
  it('creates a post, saves a draft, and publishes it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

    // 1. Create post meta
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Draft Post', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    // 2. Save draft body
    const draftRes = await callRpc(
      '/admin/posts/saveDraft',
      {
        id: post.id,
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'hello', marks: [] }],
          },
        ],
      },
      ctx,
    )
    expect(draftRes.status).toBe(200)

    // 3. Publish latest (body is required by savePostBodySchema)
    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'published', marks: [] }],
          },
        ],
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    // 4. Verify post appears in admin list as published
    const listRes = await callRpc('/admin/posts/list', { offset: 0, limit: 10 }, ctx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{ posts: { id: string; published: boolean }[]; total: number }>(listRes)
    expect(list.total).toBe(1)
    expect(list.posts[0]?.published).toBe(true)
  })
})

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { flushWorkerRedis } from '#/_helpers/redis'
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
  await flushWorkerRedis()
})

describe('integration / public comments', () => {
  it('rejects XSS payload in comment body link href', async () => {
    const ctx = makePublicCtx({ db, pool })
    const res = await callRpc(
      '/comments/replyComment',
      {
        page_key: 'posts/nonexistent',
        name: 'Guest',
        email: 'guest@example.com',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'click', marks: ['m1'] }],
            markDefs: [{ _type: 'link', _key: 'm1', href: "javascript:alert('xss')" }],
          },
        ],
      },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a comment body exceeding 10,000 characters', async () => {
    const adminCtx = makeAuthedCtx({ role: 'admin', db, pool })
    const publicCtx = makePublicCtx({ db, pool })

    // Create a page so the comment target exists
    const pageRes = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Commentable Page', summary: '', slug: 'commentable' },
      adminCtx,
    )
    expect(pageRes.status).toBe(200)

    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 1 }, adminCtx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{ pages: { id: string; commentPublicId: string }[]; total: number }>(listRes)
    const page = list.pages[0]!

    const longText = 'a'.repeat(10_001)
    const res = await callRpc(
      '/comments/replyComment',
      {
        page_key: page.commentPublicId,
        name: 'Guest',
        email: 'guest@example.com',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: longText }],
          },
        ],
      },
      publicCtx,
    )
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('最多')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/server/infra/db/pool'

import { clearAllTables } from '../_helpers/integration-db'
import { makePublicCtx } from '../_helpers/mock-ctx'
import { callRpc } from './_helpers/rpc-call'

beforeEach(async () => {
  await clearAllTables(db)
  const { redisInstance } = await import('@/server/infra/redis/storage')
  await redisInstance().flushdb()
})

describe('integration / public comments', () => {
  it('rejects XSS payload in comment body link href', async () => {
    const ctx = makePublicCtx()
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
})

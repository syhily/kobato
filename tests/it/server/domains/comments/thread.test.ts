import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / comment threading', () => {
  it('posts a comment on a page and loads it back', async () => {
    const adminCtx = makeAuthedCtx({ role: 'admin', db })
    const publicCtx = makePublicCtx({ db })

    // 1. Create a page
    const pageRes = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Commentable Page', summary: '', slug: 'commentable' },
      adminCtx,
    )
    expect(pageRes.status).toBe(200)

    // 2. List pages to trigger metric creation and get commentPublicId
    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 1 }, adminCtx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{
      pages: { id: string; commentPublicId: string }[]
      total: number
    }>(listRes)
    expect(list.total).toBe(1)
    const page = list.pages[0]!
    expect(page.commentPublicId).toBeTruthy()

    // 3. Post comment using the metric publicId as page_key
    const commentRes = await callRpc(
      '/comments/replyComment',
      {
        page_key: page.commentPublicId,
        name: 'Alice',
        email: 'alice@example.com',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'hello', marks: [] }],
          },
        ],
      },
      publicCtx,
    )
    expect(commentRes.status).toBe(200)
    const comment = await parseRpcJson<{ comment: { id: string; name: string } }>(commentRes)
    expect(comment.comment.name).toBe('Alice')

    // 4. Load comments as admin (to see pending comments) and verify
    const loadRes = await callRpc(
      '/comments/loadComments',
      { page_key: page.commentPublicId, offset: 0, limit: 10 },
      adminCtx,
    )
    expect(loadRes.status).toBe(200)
    const comments = await parseRpcJson<{
      comments: { id: string; name: string }[]
      next: boolean
    }>(loadRes)
    expect(comments.comments.length).toBeGreaterThanOrEqual(1)
    expect(comments.comments.some((c) => c.name === 'Alice')).toBe(true)
  })
})

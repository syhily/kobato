import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / draft publish flow', () => {
  it('creates a post, saves a draft, and publishes it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // 1. Create post meta
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Draft Post', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    // 2. Save draft body
    const draftRes = await callRpc(
      '/admin/posts/saveDraft',
      {
        id: post.id,
        body: {
          root: {
            direction: null,
            format: '',
            indent: 0,
            version: 1,
            type: 'root',
            children: [
              {
                direction: null,
                format: '',
                indent: 0,
                version: 1,
                type: 'paragraph',
                textFormat: 0,
                textStyle: '',
                children: [
                  { detail: 0, format: 0, mode: 'normal', style: '', text: 'hello', type: 'text', version: 1 },
                ],
              },
            ],
          },
        },
      },
      ctx,
    )
    expect(draftRes.status).toBe(200)

    // 3. Publish latest (body is required by saveBodyInput)
    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: {
          root: {
            direction: null,
            format: '',
            indent: 0,
            version: 1,
            type: 'root',
            children: [
              {
                direction: null,
                format: '',
                indent: 0,
                version: 1,
                type: 'paragraph',
                textFormat: 0,
                textStyle: '',
                children: [
                  { detail: 0, format: 0, mode: 'normal', style: '', text: 'published', type: 'text', version: 1 },
                ],
              },
            ],
          },
        },
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

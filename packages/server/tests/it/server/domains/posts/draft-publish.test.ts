import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical.ts'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / draft publish flow', () => {
  it('creates a post, saves a draft, and publishes it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Draft Post', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const draftRes = await callRpc(
      '/admin/posts/saveDraft',
      {
        id: post.id,
        body: lexicalBodyWith([lexicalParagraph('hello')]),
      },
      ctx,
    )
    expect(draftRes.status).toBe(200)

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: lexicalBodyWith([lexicalParagraph('published')]),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    const listRes = await callRpc('/admin/posts/list', { offset: 0, limit: 10 }, ctx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{ posts: { id: string; published: boolean }[]; total: number }>(listRes)
    expect(list.total).toBe(1)
    expect(list.posts[0]?.published).toBe(true)
  })
})

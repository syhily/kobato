import { comment } from '@kobato/db/schema/comment.ts'
import { canonicalizeCommentBody } from '@kobato/server/domains/comments/services/canonicalize.ts'
import { makeCommentBody } from '@kobato/server/tests/utils/catalog.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call.ts'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / comment threading', () => {
  it('posts a comment on a page and loads it back', async () => {
    const adminCtx = makeAuthedCtx({ role: 'admin', db })
    const publicCtx = makePublicCtx({ db })

    const pageRes = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Commentable Page', summary: '', slug: 'commentable' },
      adminCtx,
    )
    expect(pageRes.status).toBe(200)

    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 1 }, adminCtx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{
      pages: { id: string; commentPublicId: string }[]
      total: number
    }>(listRes)
    expect(list.total).toBe(1)
    const page = list.pages[0]!
    expect(page.commentPublicId).toBeTruthy()

    const commentRes = await callRpc(
      '/comments/replyComment',
      {
        page_key: page.commentPublicId,
        name: 'Alice',
        email: 'alice@example.com',
        body: makeCommentBody('hello'),
      },
      publicCtx,
    )
    expect(commentRes.status).toBe(200)
    const comment = await parseRpcJson<{ comment: { id: string; name: string } }>(commentRes)
    expect(comment.comment.name).toBe('Alice')

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

  it('persists body and content as same-source projections of the Lexical state', async () => {
    const adminCtx = makeAuthedCtx({ role: 'admin', db })
    const publicCtx = makePublicCtx({ db })

    await callRpc('/admin/pages/upsertMeta', { title: 'Projection Page', summary: '', slug: 'projection' }, adminCtx)
    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 1 }, adminCtx)
    const list = await parseRpcJson<{ pages: { commentPublicId: string }[] }>(listRes)
    const page = list.pages[0]!

    const input = makeCommentBody('dual column')
    const commentRes = await callRpc(
      '/comments/replyComment',
      { page_key: page.commentPublicId, name: 'Bob', email: 'bob@example.com', body: input },
      publicCtx,
    )
    expect(commentRes.status).toBe(200)
    const created = await parseRpcJson<{ comment: { id: string } }>(commentRes)

    const expected = await canonicalizeCommentBody(input)
    const rows = await db
      .select()
      .from(comment)
      .where(eq(comment.id, Number(created.comment.id)))
    expect(rows[0]?.body).toEqual(expected.body)
    expect(rows[0]?.content).toBe(expected.content)
    expect(rows[0]?.content).toBe('<p>dual column</p>')
  })
})

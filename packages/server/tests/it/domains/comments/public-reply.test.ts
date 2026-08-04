import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / public comments', () => {
  it('rejects XSS payload in comment body link href', async () => {
    const ctx = makePublicCtx({ db })
    const res = await callRpc(
      '/comments/replyComment',
      {
        page_key: 'posts/nonexistent',
        name: 'Guest',
        email: 'guest@example.com',
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
                  {
                    direction: null,
                    format: '',
                    indent: 0,
                    version: 1,
                    type: 'link',
                    url: "javascript:alert('xss')",
                    rel: null,
                    target: null,
                    title: null,
                    children: [
                      { detail: 0, format: 0, mode: 'normal', style: '', text: 'click', type: 'text', version: 1 },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a comment body exceeding 10,000 characters', async () => {
    const adminCtx = makeAuthedCtx({ role: 'admin', db })
    const publicCtx = makePublicCtx({ db })

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
                  { detail: 0, format: 0, mode: 'normal', style: '', text: longText, type: 'text', version: 1 },
                ],
              },
            ],
          },
        },
      },
      publicCtx,
    )
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('最多')
  })
})

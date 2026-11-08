import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin posts', () => {
  it('creates a post via upsert-meta and lists it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

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
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/admin/posts/list', { offset: 0, limit: 10 }, ctx)
    expect(res.status).toBe(401)
  })

  it('round-trips contentLanguage as a canonical BCP 47 tag', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createRes = await callRpc(
      '/admin/posts/upsertMeta',
      { title: '中文正文', summary: '', tags: [], contentLanguage: 'zh-hant-tw' },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ post: { id: string; contentLanguage: string | null } }>(createRes)
    expect(created.post.contentLanguage).toBe('zh-Hant-TW')

    const getRes = await callRpc('/admin/posts/get', { id: created.post.id }, ctx)
    const detail = await parseRpcJson<{ post: { contentLanguage: string | null } }>(getRes)
    expect(detail.post.contentLanguage).toBe('zh-Hant-TW')
  })

  it('keeps contentLanguage untouched when the update omits it and clears it on null', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Roundtrip', summary: '', tags: [], contentLanguage: 'ja' },
      ctx,
    )
    const created = await parseRpcJson<{ post: { id: string } }>(createRes)

    // Omitted → the stored tag survives an unrelated meta save.
    const keepRes = await callRpc(
      '/admin/posts/upsertMeta',
      { id: created.post.id, title: 'Roundtrip renamed', summary: '', tags: [] },
      ctx,
    )
    const kept = await parseRpcJson<{ post: { contentLanguage: string | null } }>(keepRes)
    expect(kept.post.contentLanguage).toBe('ja')

    // Explicit null → unset, back to inheriting the document language.
    const clearRes = await callRpc(
      '/admin/posts/upsertMeta',
      { id: created.post.id, title: 'Roundtrip renamed', summary: '', tags: [], contentLanguage: null },
      ctx,
    )
    const cleared = await parseRpcJson<{ post: { contentLanguage: string | null } }>(clearRes)
    expect(cleared.post.contentLanguage).toBeNull()
  })

  it('rejects a malformed tag with a descriptor and the contentLanguage path', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Bad tag', summary: '', tags: [], contentLanguage: 'zh_CN' },
      ctx,
    )
    expect(res.status).toBe(400)
    const body = await parseRpcJson<{
      code: string
      data: { descriptor: { messageKey: string }; issues: { path?: string[]; code?: string }[] }
    }>(res)
    expect(body.code).toBe('BAD_REQUEST')
    expect(body.data.descriptor.messageKey).toBe('admin.editor.contentLanguage.error')
    expect(body.data.issues[0]).toMatchObject({ path: ['contentLanguage'], code: 'custom' })
  })

  it('leaves contentLanguage unset for a post created without it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc('/admin/posts/upsertMeta', { title: 'No language', summary: '', tags: [] }, ctx)
    const created = await parseRpcJson<{ post: { contentLanguage: string | null } }>(res)
    expect(created.post.contentLanguage).toBeNull()
  })
})

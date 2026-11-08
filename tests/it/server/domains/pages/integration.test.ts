import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin pages', () => {
  it('creates a page via upsert-meta and lists it', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createRes = await callRpc(
      '/admin/pages/upsertMeta',
      {
        title: 'About Us',
        summary: '',
        slug: 'about',
      },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ page: { id: string; slug: string; title: string } }>(createRes)
    expect(created.page.title).toBe('About Us')
    expect(created.page.slug).toBe('about')

    const listRes = await callRpc('/admin/pages/list', { offset: 0, limit: 10 }, ctx)
    expect(listRes.status).toBe(200)
    const list = await parseRpcJson<{
      pages: { id: string; title: string }[]
      total: number
      hasMore: boolean
    }>(listRes)
    expect(list.total).toBe(1)
    expect(list.pages[0]?.title).toBe('About Us')
  })

  it('rejects unauthenticated list requests', async () => {
    const ctx = makePublicCtx({ db })
    const res = await callRpc('/admin/pages/list', { offset: 0, limit: 10 }, ctx)
    expect(res.status).toBe(401)
  })

  it('round-trips contentLanguage and rejects a malformed tag with a descriptor', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createRes = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'About', summary: '', slug: 'about', contentLanguage: 'ko-kr' },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ page: { id: string; contentLanguage: string | null } }>(createRes)
    expect(created.page.contentLanguage).toBe('ko-KR')

    const badRes = await callRpc(
      '/admin/pages/upsertMeta',
      { id: created.page.id, title: 'About', summary: '', slug: 'about', contentLanguage: 'not a tag' },
      ctx,
    )
    expect(badRes.status).toBe(400)
    const body = await parseRpcJson<{
      code: string
      data: { descriptor: { messageKey: string }; issues: { path?: string[] }[] }
    }>(badRes)
    expect(body.code).toBe('BAD_REQUEST')
    expect(body.data.descriptor.messageKey).toBe('admin.editor.contentLanguage.error')
    expect(body.data.issues[0]?.path).toEqual(['contentLanguage'])
  })
})

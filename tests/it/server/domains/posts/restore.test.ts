import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { findSlugRegistryBySlug } from '@/server/infra/db/operations/slug-registry'
import { slugRegistry } from '@/server/infra/db/schema/config'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin posts restore', () => {
  it('returns a warning when the slug was claimed by another post during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createA = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Post A', slug: 'shared-slug', summary: '', tags: [] },
      ctx,
    )
    expect(createA.status).toBe(200)
    const a = await parseRpcJson<{ post: { id: string } }>(createA)

    const deleteRes = await callRpc('/admin/posts/delete', { id: a.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // The unique constraint blocks a second post row, so the registry row is inserted directly.
    await db.insert(slugRegistry).values({
      slug: 'shared-slug',
      entityType: 'post',
      entityId: 999999,
    })

    const restoreRes = await callRpc('/admin/posts/restore', { id: a.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('shared-slug')

    const owner = await findSlugRegistryBySlug(db, 'shared-slug')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('post')
    expect(owner?.entityId).toBe(999999)
  })

  it('restores cleanly when no conflict exists', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createRes = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Lonely Post', slug: 'lonely-post', summary: '', tags: [] },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ post: { id: string } }>(createRes)

    const deleteRes = await callRpc('/admin/posts/delete', { id: created.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    const restoreRes = await callRpc('/admin/posts/restore', { id: created.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeUndefined()

    const owner = await findSlugRegistryBySlug(db, 'lonely-post')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('post')
    expect(owner?.entityId).toBe(Number(created.post.id))
  })

  it('returns a warning when the slug was claimed by a page during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const createPost = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Post A', slug: 'cross-slug', summary: '', tags: [] },
      ctx,
    )
    expect(createPost.status).toBe(200)
    const post = await parseRpcJson<{ post: { id: string } }>(createPost)

    const deleteRes = await callRpc('/admin/posts/delete', { id: post.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // Cross-entity slug reuse is allowed.
    const createPage = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Page B', slug: 'cross-slug', summary: '' },
      ctx,
    )
    expect(createPage.status).toBe(200)
    const page = await parseRpcJson<{ page: { id: string } }>(createPage)

    const restoreRes = await callRpc('/admin/posts/restore', { id: post.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('cross-slug')
    expect(restored.warning).toContain('页面')

    const owner = await findSlugRegistryBySlug(db, 'cross-slug')
    expect(owner?.entityType).toBe('page')
    expect(owner?.entityId).toBe(Number(page.page.id))
  })
})

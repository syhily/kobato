import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { findSlugRegistryBySlug } from '@/server/infra/db/operations/slug-registry'
import { slugRegistry } from '@/server/infra/db/schema/config'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin pages restore', () => {
  it('returns a warning when the slug was claimed by another page during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // 1. Create page A with slug "shared-slug"
    const createA = await callRpc('/admin/pages/upsertMeta', { title: 'Page A', slug: 'shared-slug', summary: '' }, ctx)
    expect(createA.status).toBe(200)
    const a = await parseRpcJson<{ page: { id: string } }>(createA)

    // 2. Delete page A
    const deleteRes = await callRpc('/admin/pages/delete', { id: a.page.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // 3. Seed a slug_registry entry owned by a different page to simulate
    //    another page taking the slug while A was soft-deleted. The
    //    page-level unique constraint prevents creating a second page row
    //    with the same slug, so we insert the registry row directly.
    await db.insert(slugRegistry).values({
      slug: 'shared-slug',
      entityType: 'page',
      entityId: 999999,
    })

    // 4. Restore page A — expect warning
    const restoreRes = await callRpc('/admin/pages/restore', { id: a.page.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('shared-slug')

    // 5. The seeded owner still owns the slug
    const owner = await findSlugRegistryBySlug(db, 'shared-slug')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('page')
    expect(owner?.entityId).toBe(999999)
  })

  it('restores cleanly when no conflict exists', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // Create a page, then delete it
    const createRes = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Lonely Page', slug: 'lonely', summary: '' },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ page: { id: string } }>(createRes)

    const deleteRes = await callRpc('/admin/pages/delete', { id: created.page.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // Restore — warning should be undefined
    const restoreRes = await callRpc('/admin/pages/restore', { id: created.page.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeUndefined()

    // Slug registry should point back to the restored page
    const owner = await findSlugRegistryBySlug(db, 'lonely')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('page')
    expect(owner?.entityId).toBe(Number(created.page.id))
  })

  it('returns a warning when the slug was claimed by a post during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // 1. Create page A with slug "cross-slug"
    const createPage = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Page A', slug: 'cross-slug', summary: '' },
      ctx,
    )
    expect(createPage.status).toBe(200)
    const page = await parseRpcJson<{ page: { id: string } }>(createPage)

    // 2. Delete page A
    const deleteRes = await callRpc('/admin/pages/delete', { id: page.page.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // 3. Create a post with the same slug (cross-entity reuse is allowed)
    const createPost = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Post B', slug: 'cross-slug', summary: '', tags: [] },
      ctx,
    )
    expect(createPost.status).toBe(200)
    const post = await parseRpcJson<{ post: { id: string } }>(createPost)

    // 4. Restore page A — expect warning mentioning the post
    const restoreRes = await callRpc('/admin/pages/restore', { id: page.page.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('cross-slug')
    expect(restored.warning).toContain('文章')

    // 5. Post B still owns the slug
    const owner = await findSlugRegistryBySlug(db, 'cross-slug')
    expect(owner?.entityType).toBe('post')
    expect(owner?.entityId).toBe(Number(post.post.id))
  })
})

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { findSlugRegistryBySlug } from '@/server/infra/db/operations/slug-registry'
import { slugRegistry } from '@/server/infra/db/schema/config'

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin posts restore', () => {
  it('returns a warning when the slug was claimed by another post during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // 1. Create post A with slug "shared-slug"
    const createA = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Post A', slug: 'shared-slug', summary: '', tags: [] },
      ctx,
    )
    expect(createA.status).toBe(200)
    const a = await parseRpcJson<{ post: { id: string } }>(createA)

    // 2. Delete post A
    const deleteRes = await callRpc('/admin/posts/delete', { id: a.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // 3. Seed a slug_registry entry owned by a different post to simulate
    //    another post taking the slug while A was soft-deleted. The
    //    post-level unique constraint prevents creating a second post row
    //    with the same slug, so we insert the registry row directly.
    await db.insert(slugRegistry).values({
      slug: 'shared-slug',
      entityType: 'post',
      entityId: 999999,
    })

    // 4. Restore post A — expect warning
    const restoreRes = await callRpc('/admin/posts/restore', { id: a.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('shared-slug')

    // 5. The seeded owner still owns the slug
    const owner = await findSlugRegistryBySlug(db, 'shared-slug')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('post')
    expect(owner?.entityId).toBe(999999)
  })

  it('restores cleanly when no conflict exists', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // Create a post, then delete it
    const createRes = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Lonely Post', slug: 'lonely-post', summary: '', tags: [] },
      ctx,
    )
    expect(createRes.status).toBe(200)
    const created = await parseRpcJson<{ post: { id: string } }>(createRes)

    const deleteRes = await callRpc('/admin/posts/delete', { id: created.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // Restore — warning should be undefined
    const restoreRes = await callRpc('/admin/posts/restore', { id: created.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeUndefined()

    // Slug registry should point back to the restored post
    const owner = await findSlugRegistryBySlug(db, 'lonely-post')
    expect(owner).not.toBeNull()
    expect(owner?.entityType).toBe('post')
    expect(owner?.entityId).toBe(Number(created.post.id))
  })

  it('returns a warning when the slug was claimed by a page during deletion', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // 1. Create post A with slug "cross-slug"
    const createPost = await callRpc(
      '/admin/posts/upsertMeta',
      { title: 'Post A', slug: 'cross-slug', summary: '', tags: [] },
      ctx,
    )
    expect(createPost.status).toBe(200)
    const post = await parseRpcJson<{ post: { id: string } }>(createPost)

    // 2. Delete post A
    const deleteRes = await callRpc('/admin/posts/delete', { id: post.post.id }, ctx)
    expect(deleteRes.status).toBe(200)

    // 3. Create a page with the same slug (cross-entity reuse is allowed)
    const createPage = await callRpc(
      '/admin/pages/upsertMeta',
      { title: 'Page B', slug: 'cross-slug', summary: '' },
      ctx,
    )
    expect(createPage.status).toBe(200)
    const page = await parseRpcJson<{ page: { id: string } }>(createPage)

    // 4. Restore post A — expect warning mentioning the page
    const restoreRes = await callRpc('/admin/posts/restore', { id: post.post.id }, ctx)
    expect(restoreRes.status).toBe(200)
    const restored = await parseRpcJson<{ success: boolean; warning?: string }>(restoreRes)
    expect(restored.success).toBe(true)
    expect(restored.warning).toBeTruthy()
    expect(restored.warning).toContain('cross-slug')
    expect(restored.warning).toContain('页面')

    // 5. Page B still owns the slug
    const owner = await findSlugRegistryBySlug(db, 'cross-slug')
    expect(owner?.entityType).toBe('page')
    expect(owner?.entityId).toBe(Number(page.page.id))
  })
})

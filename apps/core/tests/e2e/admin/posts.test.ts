import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'
import { lexBody, lexParagraphNode } from '#/_helpers/lexical-body'

import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('admin posts (HTTP e2e)', () => {
  it('creates, renders, and deletes a post end to end', async () => {
    const client = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(client, env)
    expect(res.status).toBe(302)
    // Login rotates the session — the CSRF token must be re-read.
    const csrfToken = await getAdminCsrfToken(client)

    // Admin write path over oRPC: create a published post with a fixed slug.
    const created = await callE2eRpc<{ post: { id: string | number; slug: string } }>(
      client,
      '/admin/posts/upsertMeta',
      {
        title: 'E2E Hello',
        slug: 'e2e-hello',
        published: true,
        publishedAt: new Date().toISOString(),
      },
      csrfToken,
    )
    expect(created.status).toBe(200)
    const postId = String(created.json.post.id)

    // upsertMeta alone never publishes (the live gate needs a published
    // revision) — publish a real body so the public page renders.
    const published = await callE2eRpc(
      client,
      '/admin/posts/publishLatest',
      { id: postId, body: lexBody([lexParagraphNode('E2E Hello 正文')]) },
      csrfToken,
    )
    expect(published.status).toBe(200)

    // Public read path (headless): the Content API serves the live post.
    const detail = await client.get('/api/content/v1/posts/e2e-hello')
    expect(detail.status).toBe(200)
    expect(await detail.text()).toContain('E2E Hello')

    // Delete via RPC — the public API must 404 with it.
    const removed = await callE2eRpc(client, '/admin/posts/delete', { id: String(created.json.post.id) }, csrfToken)
    expect(removed.status).toBe(200)

    const gone = await client.get('/api/content/v1/posts/e2e-hello')
    expect(gone.status).not.toBe(200)
  })
})

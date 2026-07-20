import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

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

    // Public read path: the post detail page renders the title.
    const detail = await client.get('/posts/e2e-hello')
    expect(detail.status).toBe(200)
    expect(await detail.text()).toContain('E2E Hello')

    // Delete via RPC — the public page must disappear with it.
    const removed = await callE2eRpc(client, '/admin/posts/delete', { id: String(created.json.post.id) }, csrfToken)
    expect(removed.status).toBe(200)

    const gone = await client.get('/posts/e2e-hello')
    expect(gone.status).not.toBe(200)
  })
})

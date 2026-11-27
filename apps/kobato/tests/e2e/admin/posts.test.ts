import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/instance/client/http'
import { callE2eRpc } from '@kobato/instance/client/rpc'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('admin posts (HTTP e2e)', () => {
  it('creates, renders, and deletes a post end to end', async () => {
    const admin = new E2eClient(env.baseUrl)
    const { flow } = await loginAdmin(admin, env)
    expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
    const csrfToken = await getAdminCsrfToken(admin)
    const publicSite = new E2eClient(env.publicBaseUrl)

    const created = await callE2eRpc<{ post: { id: string | number; slug: string } }>(
      admin,
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

    const published = await callE2eRpc(
      admin,
      '/admin/posts/publishLatest',
      {
        id: String(created.json.post.id),
        body: {
          root: {
            type: 'root',
            version: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            children: [
              {
                type: 'paragraph',
                version: 1,
                direction: 'ltr',
                format: '',
                indent: 0,
                children: [
                  {
                    type: 'extended-text',
                    version: 1,
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'E2E Hello body.',
                  },
                ],
              },
            ],
          },
        },
      },
      csrfToken,
    )
    expect(published.status).toBe(200)

    const detail = await publicSite.get('/posts/e2e-hello')
    expect(detail.status).toBe(200)
    expect(await detail.text()).toContain('E2E Hello')

    const removed = await callE2eRpc(admin, '/admin/posts/delete', { id: String(created.json.post.id) }, csrfToken)
    expect(removed.status).toBe(200)

    const gone = await publicSite.get('/posts/e2e-hello')
    expect(gone.status).not.toBe(200)
  })
})

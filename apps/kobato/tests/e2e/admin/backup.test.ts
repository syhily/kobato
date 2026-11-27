import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/test/instance/client/http'
import { callE2eRpc } from '@kobato/test/instance/client/rpc'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

const RESTART_POLL_INTERVAL_MS = 500
const RESTART_TIMEOUT_MS = 90_000

function lexicalBody(text: string): unknown {
  return {
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
          children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }],
        },
      ],
    },
  }
}

async function createPost(admin: E2eClient, csrfToken: string, slug: string, title: string): Promise<string | number> {
  const created = await callE2eRpc<{ post: { id: string | number } }>(
    admin,
    '/admin/posts/upsertMeta',
    { title, slug, published: true, publishedAt: new Date().toISOString() },
    csrfToken,
  )
  expect(created.status).toBe(200)
  const published = await callE2eRpc(
    admin,
    '/admin/posts/publishLatest',
    { id: String(created.json.post.id), body: lexicalBody(`${title} body.`) },
    csrfToken,
  )
  expect(published.status).toBe(200)
  return created.json.post.id
}

async function waitForInstanceBack(): Promise<void> {
  const probe = new E2eClient(env.baseUrl)
  const deadline = Date.now() + RESTART_TIMEOUT_MS
  let lastStatus = 'no attempt completed'
  while (Date.now() < deadline) {
    try {
      const res = await probe.get('/ready')
      if (res.status === 200) {
        return
      }
      lastStatus = `HTTP ${res.status}`
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_INTERVAL_MS))
  }
  throw new Error(`instance did not come back within ${RESTART_TIMEOUT_MS / 1000}s (last: ${lastStatus})`)
}

describe('admin backup/restore round-trip (HTTP e2e)', () => {
  it('archives, downloads, and restores the instance back to the snapshot', { timeout: 120_000 }, async () => {
    const admin = new E2eClient(env.baseUrl)
    const { flow } = await loginAdmin(admin, env)
    expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
    const csrfToken = await getAdminCsrfToken(admin)
    const publicSite = new E2eClient(env.publicBaseUrl)

    const keptId = await createPost(admin, csrfToken, 'e2e-kept', 'E2E Kept Post')

    const backup = await callE2eRpc<{ fileName: string; timestamp: string; size: number }>(
      admin,
      '/admin/backup/create',
      undefined,
      csrfToken,
    )
    expect(backup.status).toBe(200)
    expect(backup.json.fileName).toMatch(/^backup-.*\.db\.tar\.gz$/)
    expect(backup.json.size).toBeGreaterThan(0)

    const downloadData = encodeURIComponent(JSON.stringify({ json: { key: backup.json.timestamp } }))
    const download = await admin.get(`/rpc/admin/backup/download?data=${downloadData}`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain(backup.json.fileName)
    const archive = new Uint8Array(await download.arrayBuffer())
    expect(archive.length).toBeGreaterThan(0)
    expect([archive[0], archive[1]]).toEqual([0x1f, 0x8b])

    await createPost(admin, csrfToken, 'e2e-dropped', 'E2E Dropped Post')
    expect((await publicSite.get('/posts/e2e-dropped')).status).toBe(200)

    const restore = await callE2eRpc<{ accepted: boolean }>(
      admin,
      '/admin/backup/restore',
      { key: backup.json.timestamp },
      csrfToken,
    )
    expect(restore.status).toBe(200)
    expect(restore.json.accepted).toBe(true)

    await waitForInstanceBack()

    const after = new E2eClient(env.baseUrl)
    const relogin = await loginAdmin(after, env)
    expect(relogin.flow.type, `login answered ${relogin.flow.type}: ${relogin.flow.message ?? '(no message)'}`).toBe(
      'redirect',
    )

    const keptPage = await publicSite.get('/posts/e2e-kept')
    expect(keptPage.status).toBe(200)
    expect(await keptPage.text()).toContain('E2E Kept Post')
    expect((await publicSite.get('/posts/e2e-dropped')).status).not.toBe(200)

    const csrfAfter = await getAdminCsrfToken(after)
    await callE2eRpc(after, '/admin/posts/delete', { id: String(keptId) }, csrfAfter)
  })
})

import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

const env = e2eEnv()

const RESTART_POLL_INTERVAL_MS = 500
const RESTART_TIMEOUT_MS = 90_000

/**
 * Poll /ready until the instance answers 200 again. /health always 200s
 * while the socket is up — even mid-restart — so it cannot witness the
 * drain → swap → reopen → graceful-restart cycle; /ready 503s with the
 * restore machine's phase until the server is truly back, which is the
 * gate the relogin below needs. Connection errors during the brief
 * socket close are expected and retried.
 */
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

// Backup → download → restore round-trip. The restore swaps the database
// file back to the archived snapshot and restarts the server in-process,
// so the assertions bracket it: content written BEFORE the backup must
// survive, content written AFTER it must be gone.
describe('admin backup/restore round-trip (HTTP e2e)', () => {
  it('archives, downloads, and restores the instance back to the snapshot', { timeout: 120_000 }, async () => {
    const admin = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(admin, env)
    expect(res.status).toBe(302)
    const csrfToken = await getAdminCsrfToken(admin)

    // Content present in the snapshot.
    const kept = await callE2eRpc<{ post: { id: string | number } }>(
      admin,
      '/admin/posts/upsertMeta',
      { title: 'E2E Kept Post', slug: 'e2e-kept', published: true, publishedAt: new Date().toISOString() },
      csrfToken,
    )
    expect(kept.status).toBe(200)

    // Trigger the backup — a real gzipped tar archive in local storage.
    const backup = await callE2eRpc<{ fileName: string; timestamp: string; size: number }>(
      admin,
      '/admin/backup/create',
      undefined,
      csrfToken,
    )
    expect(backup.status).toBe(200)
    expect(backup.json.fileName).toMatch(/^backup-.*\.db\.tar\.gz$/)
    expect(backup.json.size).toBeGreaterThan(0)

    // Download streams the archive bytes back out.
    const download = await admin.get(`/api/admin/backup/download/${backup.json.timestamp}`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain(backup.json.fileName)
    const archive = new Uint8Array(await download.arrayBuffer())
    expect(archive.length).toBeGreaterThan(0)
    // gzip magic.
    expect([archive[0], archive[1]]).toEqual([0x1f, 0x8b])

    // Content written AFTER the snapshot must not survive the restore.
    const dropped = await callE2eRpc<{ post: { id: string | number } }>(
      admin,
      '/admin/posts/upsertMeta',
      { title: 'E2E Dropped Post', slug: 'e2e-dropped', published: true, publishedAt: new Date().toISOString() },
      csrfToken,
    )
    expect(dropped.status).toBe(200)
    expect((await admin.get('/posts/e2e-dropped')).status).toBe(200)

    // Restore — accepted, then the instance drains and restarts.
    const restore = await callE2eRpc<{ accepted: boolean }>(
      admin,
      '/admin/backup/restore',
      { key: backup.json.timestamp },
      csrfToken,
    )
    expect(restore.status).toBe(200)
    expect(restore.json.accepted).toBe(true)

    await waitForInstanceBack()

    // The instance is back on the snapshot: sign in fresh and verify
    // both sides of the bracket.
    const after = new E2eClient(env.baseUrl)
    const relogin = await loginAdmin(after, env)
    expect(relogin.res.status).toBe(302)

    const keptPage = await after.get('/posts/e2e-kept')
    expect(keptPage.status).toBe(200)
    expect(await keptPage.text()).toContain('E2E Kept Post')
    expect((await after.get('/posts/e2e-dropped')).status).not.toBe(200)

    // Leave the instance tidy for later journeys.
    const csrfAfter = await getAdminCsrfToken(after)
    await callE2eRpc(after, '/admin/posts/delete', { id: String(kept.json.post.id) }, csrfAfter)
  })
})

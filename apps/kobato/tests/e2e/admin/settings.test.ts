import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/harness/http.ts'
import { callE2eRpc } from '@kobato/harness/rpc.ts'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('admin settings write (HTTP e2e)', () => {
  it('updates the site title and the public site reflects it immediately', async () => {
    const admin = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(admin, env)
    expect(res.status).toBe(302)
    const csrfToken = await getAdminCsrfToken(admin)

    const renamed = 'E2E Renamed Site'
    try {
      const updated = await callE2eRpc<{ section: unknown }>(
        admin,
        '/admin/settings/update',
        { section: 'general', payload: { title: renamed } },
        csrfToken,
      )
      expect(updated.status).toBe(200)
      expect(JSON.stringify(updated.json.section)).toContain(renamed)

      const anon = new E2eClient(env.baseUrl)
      const home = await anon.get('/')
      expect(home.status).toBe(200)
      expect(await home.text()).toContain(renamed)
    } finally {
      await callE2eRpc(
        admin,
        '/admin/settings/update',
        { section: 'general', payload: { title: 'Kobato Smoke' } },
        csrfToken,
      )
    }

    const restored = await new E2eClient(env.baseUrl).get('/')
    expect(await restored.text()).toContain('Kobato Smoke')
  })

  it('rejects an invalid section payload with a 400-family error', async () => {
    const admin = new E2eClient(env.baseUrl)
    await loginAdmin(admin, env)
    const csrfToken = await getAdminCsrfToken(admin)

    const res = await admin.postJson(
      '/rpc/admin/settings/update',
      { json: { section: 'general', payload: { title: '' } } },
      { 'x-csrf-token': csrfToken },
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

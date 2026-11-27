import { E2eClient, bootstrapCsrfToken, e2eEnv, loginAdmin } from '@kobato/instance/client/http'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('auth/signin (HTTP e2e)', () => {
  it('serves the signin SPA shell and mints a bootstrap csrf token', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin/signin')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const csrfToken = await bootstrapCsrfToken(client)
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a wrong password with an error flow answer', async () => {
    const client = new E2eClient(env.baseUrl)
    const { flow } = await loginAdmin(client, { ...env, adminPassword: 'definitely-wrong-password' })
    expect(flow.type).toBe('error')
  })

  it('signs in with the seeded admin and reaches /admin', async () => {
    const client = new E2eClient(env.baseUrl)
    const { flow } = await loginAdmin(client, env)
    expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
    expect(flow.to).toBe('/admin')
    expect(client.cookieHeader()).toContain('__session=')

    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)
  })

  it('keeps anonymous users out of the admin RPC surface', async () => {
    const client = new E2eClient(env.baseUrl)
    const csrfToken = await bootstrapCsrfToken(client)
    const res = await client.postJson(
      '/rpc/admin/settings/bootstrap',
      { json: undefined },
      { 'x-csrf-token': csrfToken },
    )
    expect(res.status).toBe(401)
  })
})

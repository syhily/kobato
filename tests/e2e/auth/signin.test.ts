import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, loginAdmin } from '#/_helpers/e2e-client'

const env = e2eEnv()

describe('auth/signin (HTTP e2e)', () => {
  it('serves the signin page with a csrf_token hidden input', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin/signin')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('name="csrf_token"')
  })

  it('rejects a wrong password (no redirect)', async () => {
    const client = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(client, { ...env, adminPassword: 'definitely-wrong-password' })
    // Bad credentials return a 200 error payload — only success redirects.
    expect(res.status).not.toBe(302)
  })

  it('signs in with the seeded admin and reaches /admin', async () => {
    const client = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(client, env)
    expect(res.status).toBe(302)
    expect(client.cookieHeader()).toContain('__session=')

    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)
  })

  it('redirects anonymous users from /admin to signin', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin')
    expect([301, 302, 303]).toContain(res.status)
    expect(res.headers.get('location')).toContain('/admin/signin')
  })
})

import { E2eClient, e2eEnv, loginAdmin } from '@kobato/harness/http.ts'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('setup install gate (HTTP e2e)', () => {
  it('redirects /admin/setup to /admin/signin', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin/setup')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/admin/signin')
  })

  it('blocks an install-replay POST, and the seeded admin still signs in afterwards', async () => {
    const client = new E2eClient(env.baseUrl)

    const replay = await client.postForm('/admin/setup', {
      intent: 'install',
      title: 'Hijacked Blog',
      name: 'Second Admin',
      email: 'second-admin@kobato.local',
      password: 'replay-password-123',
    })
    expect(replay.status).toBe(303)
    expect(replay.headers.get('location')).toContain('/admin/signin')

    const { res } = await loginAdmin(client, env)
    expect(res.status).toBe(302)
    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)
  })
})

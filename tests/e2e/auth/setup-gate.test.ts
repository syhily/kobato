import { E2eClient, e2eEnv, loginAdmin } from '#/_helpers/e2e-client'

import { describe, expect, it } from 'vitest'

const env = e2eEnv()

// The install gate on an INSTALLED instance: the setup wizard is closed
// for both reads and writes, and the seeded admin — not a replayed
// install — owns the login. (The fresh-instance side of the gate, 303 →
// /admin/setup, is asserted by scripts/sea/e2e.ts before this suite runs.)
describe('setup install gate (HTTP e2e)', () => {
  it('redirects /admin/setup to /admin/signin', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin/setup')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/admin/signin')
  })

  it('blocks an install-replay POST, and the seeded admin still signs in afterwards', async () => {
    const client = new E2eClient(env.baseUrl)
    // A hand-crafted replay of the install wizard hits the same gate as
    // the loader (the action's own hasAdmin() check is the backstop).
    const replay = await client.postForm('/admin/setup', {
      intent: 'install',
      title: 'Hijacked Blog',
      name: 'Second Admin',
      email: 'second-admin@kobato.local',
      password: 'replay-password-123',
    })
    expect(replay.status).toBe(303)
    expect(replay.headers.get('location')).toContain('/admin/signin')

    // The gate held: the seeded admin signs in and reaches /admin.
    const { res } = await loginAdmin(client, env)
    expect(res.status).toBe(302)
    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)
  })
})

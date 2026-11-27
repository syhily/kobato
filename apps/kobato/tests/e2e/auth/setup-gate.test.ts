import { E2eClient, bootstrapCsrfToken, e2eEnv, loginAdmin } from '@kobato/instance/client/http'
import { callE2eRpc } from '@kobato/instance/client/rpc'
import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('setup install gate (HTTP e2e)', () => {
  it('serves the setup shell through the SPA perimeter on the installed instance', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/admin/setup')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('blocks an install-replay RPC, and the seeded admin still signs in afterwards', async () => {
    const client = new E2eClient(env.baseUrl)
    const csrfToken = await bootstrapCsrfToken(client)
    const replay = await callE2eRpc<{ type: string; message?: string }>(
      client,
      '/account/setup/install',
      {
        title: 'Hijacked Blog',
        name: 'Second Admin',
        email: 'second-admin@kobato.local',
        password: 'replay-password-123',
      },
      csrfToken,
    )
    expect(replay.status).toBe(200)
    expect(replay.json.type).toBe('error')

    const { flow } = await loginAdmin(client, env)
    expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)
  })
})

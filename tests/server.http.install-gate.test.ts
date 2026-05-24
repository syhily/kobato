import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

// The install gate calls `hasAdmin()` (DB). We stub it so we can drive
// the two install states directly.

const mockHasAdmin = vi.fn()

vi.mock('@/server/infra/db/operations/user', () => ({
  hasAdmin: () => mockHasAdmin(),
}))

async function createApp(): Promise<Hono<Env>> {
  const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
  const app = new Hono<Env>()
  app.use(honoInstallGateMiddleware)
  app.all('*', (c) => c.json({ passed: true, path: c.req.path }, 200))
  return app
}

describe('honoInstallGateMiddleware', () => {
  it('lets exempt exact paths through in any state', async () => {
    mockHasAdmin.mockResolvedValue(false)

    const app = await createApp()
    const res = await app.request('/admin/setup')
    expect(res.status).toBe(200)
  })

  it('lets exempt exact paths with React Router .data suffix through in noAdmin state', async () => {
    mockHasAdmin.mockResolvedValue(false)

    const app = await createApp()
    const res = await app.request('/admin/setup.data', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('lets exempt exact paths with .data suffix through in installed state', async () => {
    mockHasAdmin.mockResolvedValue(true)

    const app = await createApp()
    const res = await app.request('/admin/signin.data', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('still redirects non-exempt .data requests in noAdmin state', async () => {
    mockHasAdmin.mockResolvedValue(false)

    const app = await createApp()
    const res = await app.request('/admin/some-other.php.data', { method: 'POST' })
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/admin/setup')
  })

  it('redirects non-exempt requests in noAdmin state', async () => {
    mockHasAdmin.mockResolvedValue(false)

    const app = await createApp()
    const res = await app.request('/dashboard')
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/admin/setup')
  })
})

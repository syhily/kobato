import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

// The install gate calls `hasAdmin()` (DB). We stub it so we can drive
// the two install states directly.

const mockHasAdmin = vi.fn()
const mockHydrate = vi.fn()

vi.mock('@/server/infra/db/operations/user', () => ({
  hasAdmin: () => mockHasAdmin(),
}))

vi.mock('@/server/domains/settings/snapshot', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/settings/snapshot')>(
    '@/server/domains/settings/snapshot',
  )
  return {
    ...actual,
    hydrateBlogSettings: () => mockHydrate(),
  }
})

async function createApp(): Promise<Hono<Env>> {
  const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
  const app = new Hono<Env>()
  app.use(honoInstallGateMiddleware)
  app.all('*', (c) => c.json({ passed: true, path: c.req.path }, 200))
  return app
}

describe('honoInstallGateMiddleware', () => {
  beforeEach(() => {
    mockHydrate.mockReset()
    mockHydrate.mockResolvedValue(null)
  })

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

  it('hydrates blog settings on every request so downstream loaders see warm data', async () => {
    mockHydrate.mockResolvedValue(null)
    mockHasAdmin.mockResolvedValue(true)

    const app = await createApp()
    await app.request('/dashboard')

    expect(mockHydrate).toHaveBeenCalledOnce()
  })

  it('still lets the request through when hydration throws', async () => {
    mockHydrate.mockRejectedValue(new Error('DB timeout'))
    mockHasAdmin.mockResolvedValue(true)

    const app = await createApp()
    const res = await app.request('/dashboard')

    expect(res.status).toBe(200)
    expect(mockHydrate).toHaveBeenCalledOnce()
  })
})

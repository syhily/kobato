import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/server/domains/auth/context', () => ({
  getRouteRequestContext: vi.fn().mockReturnValue({
    role: 'admin',
    user: { id: '1', name: 'Admin', email: 'admin@test' },
    url: new URL('http://localhost/admin/posts'),
  }),
}))

vi.mock('@/server/infra/db/operations/comment', () => ({
  countAdminPendingDashboard: vi.fn(async () => ({ all: 0, approval: 0, deletion: 0 })),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  countUsers: vi.fn(async () => 0),
}))

describe('integration: admin layout loader issues a CSRF token', () => {
  it('returns csrfToken in the loader data', async () => {
    const { loader } = await import('@/routes/admin/layout')
    const request = new Request('http://localhost/admin/posts')
    const result = await loader({ request, context: new Map(), params: {} } as any)

    expect(result).toBeDefined()
    expect(result.type).toBe('DataWithResponseInit')

    // React Router's `data()` returns `{ type, data, init }` where `data`
    // is the plain payload object (already serialised by RR).
    const payload = result.data
    expect(payload.csrfToken).toBeDefined()
    expect(typeof payload.csrfToken).toBe('string')
    expect(payload.csrfToken.length).toBeGreaterThan(0)
  })
})

import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { db } from '@/server/infra/db/pool'
import { setting, user } from '@/server/infra/db/schema'

import { clearAllTables } from './_helpers/integration-db'
import { flushWorkerRedis } from './_helpers/redis'
import { emptySession } from './_helpers/session'

vi.mock('@/server/domains/auth/context', () => ({
  getRouteRequestContext: vi.fn().mockReturnValue({
    session: emptySession(),
    user: undefined,
    role: null,
    clientAddress: '127.0.0.1',
    url: new URL('http://localhost/admin/setup'),
  }),
}))

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: vi.fn(async () => null),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
}))

const { action, loader } = await import('@/routes/auth/setup/index')

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
})

// React Router's `redirect()` throws a Response object — catch it.
async function catchResponse(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
  throw new Error('Expected route to throw a Response')
}

describe('integration: /admin/setup full install flow', () => {
  it('loader returns data and action redirects to /admin', async () => {
    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: new Map(),
      params: {},
      pattern: 'admin/setup',
    })

    const payload = (loaderResult as { data: Record<string, unknown> }).data
    expect(payload).toBeDefined()

    const formData = new FormData()
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'correcthorsebatterystaple')

    const response = await catchResponse(
      action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: new Map(),
        params: {},
        pattern: 'admin/setup',
      }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/admin')

    // Verify admin user was created
    const adminRows = await db.select().from(user).where(eq(user.role, 'admin'))
    expect(adminRows).toHaveLength(1)
    expect(adminRows[0]?.name).toBe('Admin')
    expect(adminRows[0]?.email).toBe('admin@example.com')
    expect(adminRows[0]?.role).toBe('admin')

    // Verify settings were seeded
    const settingRows = await db
      .select()
      .from(setting)
      .where(sql`${setting.scope} like 'blog.%'`)
    expect(settingRows.length).toBe(15)

    const scopes = new Set(settingRows.map((r) => r.scope))
    const EXPECTED_SECTIONS = [
      'blog.general',
      'blog.assets',
      'blog.navigation',
      'blog.socials',
      'blog.content',
      'blog.sidebar',
      'blog.comments',
      'blog.seo',
      'blog.mail',
      'blog.cache',
      'blog.rateLimit',
      'blog.search',
      'blog.fonts',
      'blog.backup',
      'blog.limits',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(scopes.has(scope)).toBe(true)
    }

    const cookies = response.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('__session='))).toBe(true)
  })

  it('action accepts valid form data and redirects to /admin', async () => {
    const formData = new FormData()
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'correcthorsebatterystaple')

    // Successful setup throws a redirect Response.
    let response: Response | undefined
    try {
      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: formData,
        }),
        url: new URL('http://localhost/admin/setup'),
        context: new Map(),
        params: {},
        pattern: 'admin/setup',
      })
    } catch (caught) {
      response = caught as Response
    }

    expect(response!.status).toBe(302)
    expect(response!.headers.get('Location')).toBe('/admin')
  })
})

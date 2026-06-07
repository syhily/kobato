import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from '#/_helpers/context'
import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { emptySession } from '#/_helpers/session'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'

vi.mock('@/server/domains/auth/context', async () => {
  const { createAuthContextMockModule } = await import('#/_helpers/auth-context-mock')
  return createAuthContextMockModule({ mockDbPool: true })
})

const poolDb = createDbPool()
const db: NodePgDatabase = poolDb.db
const pool: Pool = poolDb.pool

afterAll(async () => {
  await closePool(pool)
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  ensureInstalledOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => false),
  getInstallState: vi.fn(async () => 'noAdmin' as const),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: vi.fn(async () => null),
}))

vi.mock('@/server/infra/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/rate-limit')>()
  return {
    ...actual,
    tryRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
    tryKeyedRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  }
})

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/domains/auth/setup-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/setup-token')>()
  return {
    ...actual,
    verifySetupToken: vi.fn(async () => true),
    getSetupToken: vi.fn(async () => 'test-setup-token'),
    isSetupTokenActive: vi.fn(async () => true),
  }
})

const mockContext = await import('@/server/domains/auth/context')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeAll(() => {
  vi.mocked(mockContext.getDbFromContext).mockReturnValue(db)
  vi.mocked(mockContext.getPoolFromContext).mockReturnValue(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
})

describe('integration: /admin/setup full install flow', () => {
  it('verifies token then installs and redirects to /admin', async () => {
    const session = emptySession()

    // 1. Loader returns unverified state
    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })

    const loaderPayload = (loaderResult as { data: Record<string, unknown> }).data
    expect(loaderPayload.setupTokenVerified).toBe(false)

    // 2. Submit setup token verification
    const verifyFormData = new FormData()
    verifyFormData.set('intent', 'verify-token')
    verifyFormData.set('setup_token', 'test-setup-token')

    const verifyResult = await action({
      request: new Request('http://localhost/admin/setup', {
        method: 'POST',
        body: verifyFormData,
      }),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })

    const verifyPayload = (verifyResult as { data?: Record<string, unknown> }).data
    expect(verifyPayload?.setupTokenVerified).toBe(true)

    // 3. Submit install form
    const installFormData = new FormData()
    installFormData.set('intent', 'install')
    installFormData.set('title', 'My Blog')
    installFormData.set('name', 'Admin')
    installFormData.set('email', 'admin@example.com')
    installFormData.set('password', 'CorrectHorse1')

    const response = (await action({
      request: new Request('http://localhost/admin/setup', {
        method: 'POST',
        body: installFormData,
      }),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })) as Response

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
    expect(settingRows.length).toBe(17)

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
      'blog.security',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(scopes.has(scope)).toBe(true)
    }

    const cookies = response.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('__session='))).toBe(true)
  })

  it('install action without verification returns error', async () => {
    const formData = new FormData()
    formData.set('intent', 'install')
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'CorrectHorse1')

    const result = await action({
      request: new Request('http://localhost/admin/setup', {
        method: 'POST',
        body: formData,
      }),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext(),
      params: {},
      pattern: 'admin/setup',
    })

    const payload = (result as { data?: { error?: string } }).data
    expect(payload?.error).toBe('请先验证 Setup Token。')
  })
})

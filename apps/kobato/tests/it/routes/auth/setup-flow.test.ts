import { setting } from '@kobato/db/schema/config.ts'
import { oneTimeToken } from '@kobato/db/schema/one-time-token.ts'
import { user } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { makeRouteContext } from '@kobato/test/context.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { emptySession } from '@kobato/test/session.ts'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/http/request-context.ts', async () => {
  const { createRequestContextMockModule } = await import('@kobato/test/auth-context-mock.ts')
  return createRequestContextMockModule()
})

const db = getTestDb()

const CSRF_TOKEN = 'setup-flow-csrf-token'

const mockContext = await import('@kobato/server/http/request-context.ts')
const { action, loader } = await import('@/routes/auth/setup/index.tsx')

beforeAll(() => {
  const fromProvider = vi.mocked(mockContext.getRequestContext).getMockImplementation()
  vi.mocked(mockContext.getRequestContext).mockImplementation((args) => ({
    ...fromProvider!(args),
    db,
  }))
})

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  const { __resetRateLimitsForTests } = await import('@kobato/server/infra/rate-limit.ts')
  __resetRateLimitsForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

async function readMintedSetupToken(): Promise<string> {
  const rows = await db.select().from(oneTimeToken).where(eq(oneTimeToken.key, 'setup_token'))
  expect(rows).toHaveLength(1)
  return rows[0]!.payload as string
}

describe('integration: /admin/setup full install flow', () => {
  it('verifies token then installs and redirects to /admin', async () => {
    const session = emptySession()
    session.set('csrfToken', CSRF_TOKEN)

    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })

    const loaderPayload = (loaderResult as { data: Record<string, unknown> }).data
    expect(loaderPayload.setupTokenVerified).toBe(false)

    const setupToken = await readMintedSetupToken()
    const verifyFormData = new FormData()
    verifyFormData.set('intent', 'verify-token')
    verifyFormData.set('setup_token', setupToken)
    verifyFormData.set('csrf_token', CSRF_TOKEN)

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

    const installFormData = new FormData()
    installFormData.set('intent', 'install')
    installFormData.set('title', 'My Blog')
    installFormData.set('name', 'Admin')
    installFormData.set('email', 'admin@example.com')
    installFormData.set('password', 'CorrectHorse1')
    installFormData.set('locale', 'en-US')
    installFormData.set('csrf_token', CSRF_TOKEN)

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

    const adminRows = await db.select().from(user).where(eq(user.role, 'admin'))
    expect(adminRows).toHaveLength(1)
    expect(adminRows[0]?.name).toBe('Admin')
    expect(adminRows[0]?.email).toBe('admin@example.com')
    expect(adminRows[0]?.role).toBe('admin')

    const settingRows = await db
      .select()
      .from(setting)
      .where(sql`${setting.scope} like 'blog.%'`)
    expect(settingRows.length).toBe(19)

    const scopes = new Set(settingRows.map((r) => r.scope))
    const EXPECTED_SECTIONS = [
      'blog.general',
      'blog.assets',
      'blog.navigation',
      'blog.socials',
      'blog.content',
      'blog.sidebar',
      'blog.comments',
      'blog.webmentions',
      'blog.seo',
      'blog.mail',
      'blog.newsletter',
      'blog.cache',
      'blog.rateLimit',
      'blog.fonts',
      'blog.backup',
      'blog.limits',
      'blog.analytics',
      'blog.security',
      'blog.observability',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(scopes.has(scope)).toBe(true)
    }

    const { getBlogSettingsBundleSync } = await import('@kobato/settings/getters.ts')
    expect(getBlogSettingsBundleSync()?.siteIdentity?.title).toBe('My Blog')
    expect(getBlogSettingsBundleSync()?.siteIdentity?.locale).toBe('en-US')

    expect(await db.select().from(oneTimeToken).where(eq(oneTimeToken.key, 'setup_token'))).toHaveLength(0)

    const cookies = response.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('__session='))).toBe(true)
  })

  it('install action without verification returns error', async () => {
    const session = emptySession()
    session.set('csrfToken', CSRF_TOKEN)

    const formData = new FormData()
    formData.set('intent', 'install')
    formData.set('title', 'My Blog')
    formData.set('name', 'Admin')
    formData.set('email', 'admin@example.com')
    formData.set('password', 'CorrectHorse1')
    formData.set('csrf_token', CSRF_TOKEN)

    const result = await action({
      request: new Request('http://localhost/admin/setup', {
        method: 'POST',
        body: formData,
      }),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })

    const payload = (result as { data?: { error?: string } }).data
    expect(payload?.error).toBe('请先验证 Setup Token。')
  })
})

import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeRouteContext } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { emptySession } from '#/_helpers/session'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { setting } from '@/server/infra/db/schema/config'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { user } from '@/server/infra/db/schema/user'

vi.mock('@/server/http/request-context', async () => {
  const { createRequestContextMockModule } = await import('#/_helpers/auth-context-mock')
  return createRequestContextMockModule()
})

const db = getTestDb()

// Everything else runs against the REAL engine: the install gate derives
// its state from the `user` table (a cleared table is the noAdmin branch),
// the setup token is a real row in `one_time_token` (the loader mints it
// on the first visit; its boxLog stdout noise is expected), and CSRF is
// the real session-token check (session + form field below). The real
// install also fires the login audit through the process-level batcher,
// so this file keeps the batcher lifecycle hygiene.
const CSRF_TOKEN = 'setup-flow-csrf-token'

const mockContext = await import('@/server/http/request-context')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeAll(() => {
  // The factory mock derives the RequestContext from the RouterContextProvider
  // on each call (the per-test session keeps flowing through); overlay the
  // real db/pool handles so the install flow hits the integration database.
  const fromProvider = vi.mocked(mockContext.getRequestContext).getMockImplementation()
  vi.mocked(mockContext.getRequestContext).mockImplementation((args) => ({
    ...fromProvider!(args),
    db,
  }))
})

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  const { __resetRateLimitsForTests } = await import('@/server/infra/rate-limit')
  __resetRateLimitsForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

/** Read the setup token the loader minted into `one_time_token`. */
async function readMintedSetupToken(): Promise<string> {
  const rows = await db.select().from(oneTimeToken).where(eq(oneTimeToken.key, 'setup_token'))
  expect(rows).toHaveLength(1)
  return rows[0]!.payload as string
}

describe('integration: /admin/setup full install flow', () => {
  it('verifies token then installs and redirects to /admin', async () => {
    const session = emptySession()
    session.set('csrfToken', CSRF_TOKEN)

    // 1. Loader returns unverified state (and mints the real setup token
    //    into `one_time_token` as a side effect).
    const loaderResult = await loader({
      request: new Request('http://localhost/admin/setup'),
      url: new URL('http://localhost/admin/setup'),
      context: makeRouteContext({ session }),
      params: {},
      pattern: 'admin/setup',
    })

    const loaderPayload = (loaderResult as { data: Record<string, unknown> }).data
    expect(loaderPayload.setupTokenVerified).toBe(false)

    // 2. Submit setup token verification with the real minted token.
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

    // 3. Submit install form
    const installFormData = new FormData()
    installFormData.set('intent', 'install')
    installFormData.set('title', 'My Blog')
    installFormData.set('name', 'Admin')
    installFormData.set('email', 'admin@example.com')
    installFormData.set('password', 'CorrectHorse1')
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
    // 17 sections — `blog.search` was removed.
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
      'blog.newsletter',
      'blog.cache',
      'blog.rateLimit',
      'blog.fonts',
      'blog.backup',
      'blog.limits',
      'blog.analytics',
      'blog.security',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(scopes.has(scope)).toBe(true)
    }

    // The install action's refreshBlogSettings is REAL: the in-process
    // snapshot now reflects the rows the install just wrote.
    const { getBlogSettingsBundleSync } = await import('@/shared/config/getters')
    expect(getBlogSettingsBundleSync()?.siteIdentity?.title).toBe('My Blog')

    // The install consumed the setup token: the row is gone.
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

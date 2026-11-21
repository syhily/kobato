import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'

import { closeDatabase } from '@kobato/db/database.ts'
import { upsertSetting } from '@kobato/db/operations/setting.ts'
import { requestContext } from '@kobato/server/http/request-context.ts'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'
import { resetBlogSettingsForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const { buildLoadContext } = await import('@kobato/server/http/middleware-pipeline.ts')

const db = getTestDb()

function makeContextStub(overrides: Record<string, unknown> = {}) {
  return {
    var: {
      requestContext: {
        ...makeRequestContext({
          session: { get: () => undefined } as unknown as BlogSession,
          clientAddress: '127.0.0.1',
          db,
          cspNonce: 'test-nonce-123',
        }),
        ...overrides,
      },
    },
    req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
  } as any
}

describe('middleware-pipeline / buildLoadContext', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    resetBlogSettingsForTests()
  })

  it('populates the settings snapshot from the real setting table before returning', async () => {
    upsertSetting(
      db,
      TEST_BLOG_SETTINGS_BUNDLE.siteIdentity as unknown as Record<string, unknown>,
      null,
      SECTION_REGISTRY.general.scope,
    )
    upsertSetting(
      db,
      TEST_BLOG_SETTINGS_BUNDLE.assets as unknown as Record<string, unknown>,
      null,
      SECTION_REGISTRY.assets.scope,
    )
    expect(getBlogSettingsBundleSync()).toBeNull()

    const context = await buildLoadContext(makeContextStub())

    expect(context).toBeDefined()
    const bundle = getBlogSettingsBundleSync()
    expect(bundle?.siteIdentity?.title).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title)
    expect(bundle?.assets).not.toBeNull()
  })

  it('resolves to a null snapshot on an empty setting table — the pre-install state', async () => {
    await buildLoadContext(makeContextStub())
    expect(getBlogSettingsBundleSync()).toBeNull()
  })

  it('does not swallow a hydration failure — it propagates so the request becomes a 500', async () => {
    const closed = createTestDatabaseFile()
    closeDatabase(closed)

    await expect(buildLoadContext(makeContextStub({ db: closed.db }))).rejects.toThrow()
  })

  it('sets the canonical RequestContext as the single React Router context value', async () => {
    const c = makeContextStub()
    const context = await buildLoadContext(c)

    expect(context.get(requestContext)).toBe(c.var.requestContext)
    expect(context.get(requestContext)?.cspNonce).toBe('test-nonce-123')
  })
})

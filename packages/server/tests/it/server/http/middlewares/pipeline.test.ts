import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'

import { closeDatabase } from '@kobato/db/database.ts'
import { upsertSetting } from '@kobato/db/operations/setting.ts'
import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry.ts'
import { requestContext } from '@kobato/server/http/request-context.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { resetBlogSettingsForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '@kobato/test/integration-db.ts'
import { makeRequestContext } from '@kobato/test/request-context.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const { buildLoadContext } = await import('@kobato/server/http/middleware-pipeline.ts')

// Real hydration against the harness db (no getDb/hydrate doubles); the stub carries
// the canonical context fields plus the pass-through handles (`db` / `cspNonce`).
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
    // Pre-install state so the real hydrate re-reads the setting table, not the seeded bundle.
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

    // Hydration wrote the snapshot before the context returned — loaders read sections synchronously.
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
    // Real failure mode: the db handle is closed underneath the hydration query.
    const closed = createTestDatabaseFile()
    closeDatabase(closed)

    await expect(buildLoadContext(makeContextStub({ db: closed.db }))).rejects.toThrow()
  })

  it('sets the canonical RequestContext as the single React Router context value', async () => {
    const c = makeContextStub()
    const context = await buildLoadContext(c)

    // The provider carries the canonical RequestContext itself — the CSP nonce rides inside it.
    expect(context.get(requestContext)).toBe(c.var.requestContext)
    expect(context.get(requestContext)?.cspNonce).toBe('test-nonce-123')
  })
})

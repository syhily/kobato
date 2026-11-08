import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { getBlogSettingsBundleSync, getBlogSettingsSnapshotSync } from '@/shared/config/getters'
import { PRE_INSTALL_TIME_ZONE, resolveAppLocalization } from '@/shared/i18n/app-localization'
import { isPublicMessageKey } from '@/shared/i18n/catalog-scope'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'

// Cold-boot regression for the `/rpc/*` bridge: a pure RPC request never runs
// `buildLoadContext`, so the bridge itself must hydrate settings BEFORE it
// projects `rc.localization`. Without that await, the first cold
// `content.bootstrap` call memoizes the pre-hydration zh-CN/UTC pair and an
// installed non-default-locale site answers with the wrong catalog.

const db = getTestDb()
const CSRF = 'cold-boot-csrf-token'

const { onErrorHandler } = await import('@/server/http/errors')
const { createApiApp } = await import('@/server/http/app')
const { buildInstallSectionRows, seedInstallSections } = await import('@/server/domains/settings/services/install-flow')

function seedInstalledSite(overrides: { locale: 'zh-TW'; timeZone: string; maxRequestBodySize?: number }): void {
  const built = buildInstallSectionRows({
    title: 'Test Blog',
    name: 'Admin',
    email: 'admin@example.com',
    hostname: 'localhost',
  })
  if (!built.ok) {
    throw new Error(`expected ok rows, got: ${built.descriptor.fallbackMessage}`)
  }
  const { maxRequestBodySize, ...generalOverrides } = overrides
  const rows = built.rows.map((row) => {
    if (row.scope === 'blog.general') {
      return { scope: row.scope, payload: Object.assign({}, row.payload, generalOverrides) }
    }
    if (row.scope === 'blog.limits' && maxRequestBodySize !== undefined) {
      return { scope: row.scope, payload: Object.assign({}, row.payload, { maxRequestBodySize }) }
    }
    return row
  })
  db.transaction((tx) => {
    seedInstallSections(tx, rows, null)
  })
}

/** The real API mount, behind a request-context middleware like the perimeter. */
function makeApiApp() {
  const rc = makeRequestContext({ db, session: makeSession({ csrfToken: CSRF }) })
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', rc as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.route('/', createApiApp())
  app.onError(onErrorHandler)
  return { app, rc }
}

type BootstrapPayload = {
  i18n: { locale: string; messages: Record<string, string> }
  blogSettings: { siteIdentity?: { locale?: string } } | null
}

async function coldBootstrap(): Promise<BootstrapPayload> {
  const { app } = makeApiApp()
  const response = await app.request('/rpc/content/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
    body: '{}',
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { json: BootstrapPayload }
  return body.json
}

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
})

describe('cold /rpc/content/bootstrap', () => {
  it('hydrates settings before projecting localization (installed, non-default locale)', async () => {
    seedInstalledSite({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })
    resetBlogSettingsForTests()
    // Genuinely cold: nothing hydrated yet.
    expect(getBlogSettingsBundleSync()).toBeNull()

    const { app, rc } = makeApiApp()
    const response = await app.request('/rpc/content/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: '{}',
    })

    expect(response.status).toBe(200)
    const json = (await response.json()) as {
      json: { i18n: { locale: string; messages: Record<string, string> }; blogSettings: unknown }
    }
    expect(json.json.i18n.locale).toBe('zh-TW')
    // A public document receives exactly the public namespace allowlist.
    expect(Object.keys(json.json.i18n.messages).sort()).toEqual(
      Object.keys(uiMessagesZhTW)
        .filter((key) => isPublicMessageKey(key))
        .sort(),
    )
    expect(json.json.i18n.messages['common.action.reload']).toBe('重新整理')
    // The snapshot is hydrated by the bridge, and the SAME request context
    // resolves the site pair (no second locale resolver).
    expect(getBlogSettingsBundleSync()).not.toBeNull()
    expect(rc.localization).toMatchObject({ locale: 'zh-TW', timeZone: 'Asia/Taipei', timeFormat: null })
    expect(rc.localization.revision).toBe(getBlogSettingsSnapshotSync().revision)
  })

  it('still defaults to zh-CN/UTC pre-install', async () => {
    resetBlogSettingsForTests()

    const { app, rc } = makeApiApp()
    const response = await app.request('/rpc/content/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: '{}',
    })

    const json = (await response.json()) as { json: { i18n: { locale: string; messages: Record<string, string> } } }
    expect(json.json.i18n.locale).toBe('zh-CN')
    expect(Object.keys(json.json.i18n.messages).sort()).toEqual(
      Object.keys(uiMessagesZhCN)
        .filter((key) => isPublicMessageKey(key))
        .sort(),
    )
    expect(rc.localization).toMatchObject({ locale: 'zh-CN', timeZone: PRE_INSTALL_TIME_ZONE, timeFormat: null })
    expect(resolveAppLocalization()).toMatchObject({
      locale: 'zh-CN',
      timeZone: PRE_INSTALL_TIME_ZONE,
      timeFormat: null,
    })
  })

  it('hydrates before the body-limit resolver (cold request uses the stored limit and locale)', async () => {
    seedInstalledSite({ locale: 'zh-TW', timeZone: 'Asia/Taipei', maxRequestBodySize: 1024 })
    resetBlogSettingsForTests()
    expect(getBlogSettingsBundleSync()).toBeNull()

    const { app } = makeApiApp()
    const body = 'x'.repeat(2048)
    const response = await app.request('/rpc/content/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
        'x-csrf-token': CSRF,
      },
      body,
    })

    // 1024-byte stored limit (not the 10 MB fallback) and zh-TW copy prove the
    // snapshot was hydrated BEFORE the limiter and the request projection.
    expect(response.status).toBe(413)
    const json = (await response.json()) as { error: { message: string } }
    expect(json.error.message).toBe('請求內容過大')
  })

  it('hydrates before the CSRF guard (cold rejection still uses the site locale)', async () => {
    seedInstalledSite({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })
    resetBlogSettingsForTests()
    expect(getBlogSettingsBundleSync()).toBeNull()

    const { app } = makeApiApp()
    const response = await app.request('/rpc/content/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.status).toBe(403)
    const json = (await response.json()) as { error: { message: string } }
    expect(json.error.message).toBe('安全驗證失敗，請重新整理頁面後再試。')
    expect(getBlogSettingsBundleSync()).not.toBeNull()
  })

  it('answers the seeded locale through the full request path after a warm hydrate', async () => {
    seedInstalledSite({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })

    const payload = await coldBootstrap()

    expect(payload.i18n.locale).toBe('zh-TW')
    expect(payload.blogSettings).toMatchObject({ siteIdentity: { locale: 'zh-TW' } })
  })
})

// `TEST_BLOG_SETTINGS_BUNDLE` is imported so the IT setup's default snapshot
// stays the same object the rest of the suite expects; the cold cases above
// clear it explicitly.
void TEST_BLOG_SETTINGS_BUNDLE

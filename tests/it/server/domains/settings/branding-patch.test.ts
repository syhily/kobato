import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the schedulers out.
const db = getTestDb()

// Settings PATCH only: robots.txt inline storage + preserved ObjectRefs;
// uploads need real S3 and stay with the unit tests.

const ASSETS_BASE = {
  asset: { host: 'cdn.example.com', scheme: 'https' as const },
  storage: {
    enabled: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    urlTemplate: '',
  },
  upload: { maxBytes: 5 * 1024 * 1024, jpegQuality: 85 },
}

const SAMPLE_REF = {
  etag: 'a'.repeat(64),
  contentType: 'image/svg+xml',
  size: 42,
  updatedAt: '2024-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  resetBlogSettingsForTests()

  await db.insert(setting).values([
    {
      scope: 'blog.general',
      data: {
        title: 'Test Blog',
        description: 'A test blog',
        website: 'https://example.com',
        keywords: ['test'],
        author: { name: 'Test Author', email: 'test@example.com', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'relative',
        initialYear: 2024,
      },
    },
    {
      scope: 'blog.assets',
      data: {
        ...ASSETS_BASE,
        branding: { faviconSvg: SAMPLE_REF, logoSvg: SAMPLE_REF },
      },
    },
    {
      scope: 'blog.limits',
      data: {
        maxRequestBodySize: 10 * 1024 * 1024,
        sessionMaxAge: 60 * 60 * 24 * 30,
        auditLogDbRetentionDays: 30,
        auditLogArchiveRetentionDays: 180,
      },
    },
  ])
})

describe('integration / branding settings', () => {
  it('persists robots.txt through the assets PATCH', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const updateRes = await callRpc(
      '/admin/settings/update',
      {
        section: 'assets',
        payload: {
          ...ASSETS_BASE,
          branding: { robotsTxt: 'User-agent: *\nDisallow: /admin' },
        },
      },
      ctx,
    )
    expect(updateRes.status).toBe(200)

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.assets?.branding?.robotsTxt).toBe('User-agent: *\nDisallow: /admin')
  })

  it('preserves uploaded asset ObjectRefs when the assets section is patched without branding', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const updateRes = await callRpc(
      '/admin/settings/update',
      {
        section: 'assets',
        payload: {
          ...ASSETS_BASE,
          asset: { host: 'updated.example.com', scheme: 'https' },
        },
      },
      ctx,
    )
    expect(updateRes.status).toBe(200)
    // Admin-projected section (mask included) — the client never refetches.
    const updateBody = await parseRpcJson<{
      section: { asset: { host: string }; secretAccessKeyMask: string | null }
    }>(updateRes)
    expect(updateBody.section.asset.host).toBe('updated.example.com')
    expect(updateBody.section).toHaveProperty('secretAccessKeyMask')

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.assets?.asset.host).toBe('updated.example.com')
    expect(bundle?.assets?.branding?.faviconSvg?.etag).toBe(SAMPLE_REF.etag)
    expect(bundle?.assets?.branding?.logoSvg?.etag).toBe(SAMPLE_REF.etag)
  })

  it('merges robots.txt with persisted asset ObjectRefs without wiping them', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    await callRpc(
      '/admin/settings/update',
      {
        section: 'assets',
        payload: {
          ...ASSETS_BASE,
          branding: { robotsTxt: 'User-agent: *' },
        },
      },
      ctx,
    )

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.assets?.branding?.robotsTxt).toBe('User-agent: *')
    expect(bundle?.assets?.branding?.faviconSvg?.etag).toBe(SAMPLE_REF.etag)
    expect(bundle?.assets?.branding?.logoSvg?.etag).toBe(SAMPLE_REF.etag)
  })
})

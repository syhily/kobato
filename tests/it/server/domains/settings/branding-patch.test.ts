import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

// Asset uploads (SVG / ICO / PNG) flow through the dedicated
// /api/admin/branding/upload endpoint, which requires real S3 — so
// those code paths are exercised by the unit tests in
// `service.settings.branding.test.ts`. This integration test covers
// what's left for the settings PATCH: storing robots.txt inline and
// preserving previously-uploaded binary/SVG ObjectRefs on unrelated
// asset-section saves.

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
  await clearAllTables(db)
  const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@/shared/config/snapshot')
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)

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
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

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
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

    // Edit just the host — no branding in the PATCH payload.
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
    // The response carries the admin-projected section (mask field
    // included) so the client never refetches after a save.
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
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

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

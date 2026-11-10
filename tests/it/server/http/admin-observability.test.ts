import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { Database } from '@/server/infra/db/database'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { observabilityConnectionFingerprint } from '@/server/domains/observability/config'
import {
  __resetObservabilityRuntimeForTests,
  syncObservabilityRuntime,
} from '@/server/domains/observability/runtime-manager'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog, setting } from '@/server/infra/db/schema/config'
import { user as userTable } from '@/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const runtimeMock = vi.hoisted(() => ({
  startTraceRuntime: vi.fn(),
  stopTraceRuntime: vi.fn(),
}))

vi.mock('@/server/infra/trace/runtime', () => runtimeMock)

// The client reaches O2 through safeFetch → global fetch. Keep DNS public and
// answer every management call locally.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

const db: Database = getTestDb()

const SITE: ObservabilitySettingsSlice = {
  enabled: true,
  endpoint: 'https://obs.example.com',
  organization: 'my-site',
  username: 'admin@example.com',
  password: 'secret',
  sampleRate: 1,
  includeRedactedSql: false,
  retentionDays: 0,
  logs: { enabled: false },
  frontend: { enabled: false, sessionSampleRate: 100, clientIdentity: 'anonymous' },
  rumClientToken: '',
  verifiedFingerprint: '',
  provisionedFingerprint: '',
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function mockO2(options: { rumTokenCreateFails?: boolean } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? 'GET'
      if (url.endsWith('/healthz')) {
        return json({ status: 'ok' })
      }
      if (url.endsWith('/api/organizations')) {
        return json({ data: [{ identifier: 'my-site', name: 'my-site' }] })
      }
      if (url.endsWith('/api/my-site/config')) {
        return json({ version: 'v1.1.2' })
      }
      if (url.endsWith('/api/my-site/rumtoken')) {
        if (method === 'POST' && options.rumTokenCreateFails === true) {
          return json({}, 500)
        }
        return method === 'POST' ? json({ data: { rum_token: 'rum-new' } }) : json({}, 404)
      }
      if (url.includes('/api/my-site/functions')) {
        return method === 'GET' ? json({ list: [] }) : json({})
      }
      if (url.includes('/api/my-site/pipelines')) {
        return method === 'GET' ? json({ list: [] }) : json({ id: 'pid-1' })
      }
      if (url.includes('/api/my-site/dashboards')) {
        return method === 'GET' ? json({ dashboards: [] }) : json({ v8: { dashboardId: 'dash-1' } })
      }
      return json({})
    }),
  )
}

async function seedSettings(overrides: Partial<ObservabilitySettingsSlice> = {}): Promise<void> {
  const built = buildInstallSectionRows({ title: 'T', name: 'N', email: 'a@b.co', hostname: 'localhost' })
  if (!built.ok) {
    throw new Error(`expected install rows, got: ${built.descriptor.fallbackMessage}`)
  }
  const site = { ...SITE, ...overrides }
  for (const row of built.rows) {
    if (row.scope === 'blog.observability') {
      row.payload = { observability: site }
    }
  }
  seedInstallSections(db, built.rows, null)
  await hydrateBlogSettings(db)
}

function savedSite(): ObservabilitySettingsSlice | null {
  return getBlogSettingsBundleSync()?.observability?.observability ?? null
}

async function storedObservability(): Promise<{
  rumClientToken?: string
  verifiedFingerprint?: string
  provisionedFingerprint?: string
}> {
  const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.observability'))
  const data = rows[0]?.data as { observability?: Record<string, unknown> } | undefined
  const observability = data?.observability
  return {
    ...(typeof observability?.rumClientToken === 'string' ? { rumClientToken: observability.rumClientToken } : {}),
    ...(typeof observability?.verifiedFingerprint === 'string'
      ? { verifiedFingerprint: observability.verifiedFingerprint }
      : {}),
    ...(typeof observability?.provisionedFingerprint === 'string'
      ? { provisionedFingerprint: observability.provisionedFingerprint }
      : {}),
  }
}

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
  __resetObservabilityRuntimeForTests()
  initAllBatchers(getDatabaseHandle())
  runtimeMock.startTraceRuntime.mockReset()
  runtimeMock.stopTraceRuntime.mockReset()
  runtimeMock.startTraceRuntime.mockResolvedValue({ started: true, shutdown: vi.fn(), forceFlush: vi.fn() })
  runtimeMock.stopTraceRuntime.mockResolvedValue(undefined)
  registerSectionChangeHandler('observability', syncObservabilityRuntime)

  await db.insert(userTable).values({
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    password: 'hashed',
    role: 'admin',
  })
  mockO2()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  vi.unstubAllGlobals()
  resetBlogSettingsForTests()
  __resetObservabilityRuntimeForTests()
})

describe('admin.observability.testConnection', () => {
  it('verifies the connection, auto-provisions the assets and persists the encrypted token', async () => {
    await seedSettings()

    const res = await callRpc(
      '/admin/observability/testConnection',
      {},
      makeAuthedCtx({ db, userId: '1', role: 'admin' }),
    )
    expect(res.status).toBe(200)
    await expect(parseRpcJson(res)).resolves.toEqual({
      ok: true,
      version: 'v1.1.2',
      organization: 'exists',
      provision: {
        status: 'succeeded',
        organization: 'exists',
        rumToken: 'created',
        pipeline: 'installed',
        dashboards: 4,
        provisionedFingerprint: expect.any(String),
      },
    })

    const site = savedSite()
    expect(site?.verifiedFingerprint).toBe(observabilityConnectionFingerprint({ ...SITE }))
    expect(site?.rumClientToken).toBe('rum-new')
    expect(site?.provisionedFingerprint).not.toBe('')
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalled()

    // Secrets are encrypted on the write path, not just hidden in the bundle.
    const stored = await storedObservability()
    expect(stored.rumClientToken).toMatch(/^enc2:/)
    expect(stored.verifiedFingerprint).toBe(site?.verifiedFingerprint)
    expect(stored.provisionedFingerprint).toBe(site?.provisionedFingerprint)
  })

  it('reports a provision failure while keeping the connection verified', async () => {
    mockO2({ rumTokenCreateFails: true })
    await seedSettings()

    const res = await callRpc(
      '/admin/observability/testConnection',
      {},
      makeAuthedCtx({ db, userId: '1', role: 'admin' }),
    )
    expect(res.status).toBe(200)
    const output = await parseRpcJson<{
      ok: boolean
      provision: { status: string; descriptor: { messageKey: string } }
    }>(res)
    expect(output.ok).toBe(true)
    expect(output.provision).toMatchObject({
      status: 'failed',
      descriptor: { messageKey: 'admin.settings.observability.error.upstream' },
    })

    // The connection itself is verified and persisted; only the asset sync failed.
    expect(savedSite()?.verifiedFingerprint).toBe(observabilityConnectionFingerprint({ ...SITE }))
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalled()

    await flushAuditLog()
    const tested = await db.select().from(auditLog).where(eq(auditLog.action, 'observability_connection_tested'))
    expect(tested).toHaveLength(1)
    expect(tested[0]?.details).toMatchObject({ provision: 'failed' })
    const failed = await db.select().from(auditLog).where(eq(auditLog.action, 'observability_provisioning_failed'))
    expect(failed).toHaveLength(1)
    // A failed auto-provision never masquerades as a successful asset event.
    const provisioned = await db.select().from(auditLog).where(eq(auditLog.action, 'observability_assets_provisioned'))
    expect(provisioned).toHaveLength(0)
  })

  it('returns a classified descriptor for a rejected credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({}, 401)),
    )
    await seedSettings()

    const res = await callRpc(
      '/admin/observability/testConnection',
      {},
      makeAuthedCtx({ db, userId: '1', role: 'admin' }),
    )
    expect(res.status).toBe(400)
    const error = await parseRpcJson<{ code: string; data: { descriptor: { messageKey: string } } }>(res)
    expect(error.code).toBe('BAD_REQUEST')
    expect(error.data.descriptor.messageKey).toBe('admin.settings.observability.error.unauthorized')
    expect(savedSite()?.verifiedFingerprint ?? '').toBe('')
  })

  it('records the audit event with the provision summary on success', async () => {
    await seedSettings()
    const response = await callRpc(
      '/admin/observability/testConnection',
      {},
      makeAuthedCtx({ db, userId: '1', role: 'admin' }),
    )
    expect(response.status).toBe(200)
    await flushAuditLog()

    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'observability_connection_tested'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resourceType: 'observability', resourceId: 'my-site' })
    expect(rows[0]?.details).toMatchObject({ provision: 'succeeded', dashboards: 4, rumToken: 'created' })
  })
})

describe('admin.observability.provision', () => {
  it('refuses to provision an unverified configuration', async () => {
    await seedSettings()
    const res = await callRpc('/admin/observability/provision', {}, makeAuthedCtx({ db, userId: '1', role: 'admin' }))
    expect(res.status).toBe(400)
    const error = await parseRpcJson<{ data: { descriptor: { messageKey: string } } }>(res)
    expect(error.data.descriptor.messageKey).toBe('admin.settings.observability.error.notVerified')
  })

  it('provisions the token, pipeline and dashboards after verification', async () => {
    await seedSettings({ verifiedFingerprint: observabilityConnectionFingerprint(SITE) })

    const res = await callRpc('/admin/observability/provision', {}, makeAuthedCtx({ db, userId: '1', role: 'admin' }))
    expect(res.status).toBe(200)
    const result = await parseRpcJson<{
      organization: string
      rumToken: string
      pipeline: string
      dashboards: number
      provisionedFingerprint: string
    }>(res)
    expect(result).toMatchObject({
      organization: 'exists',
      rumToken: 'created',
      pipeline: 'installed',
      dashboards: 4,
    })
    expect(result.provisionedFingerprint).not.toBe('')

    const site = savedSite()
    expect(site?.rumClientToken).toBe('rum-new')
    expect(site?.provisionedFingerprint).toBe(result.provisionedFingerprint)

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'observability_assets_provisioned'))
    expect(rows).toHaveLength(1)
  })
})

describe('admin.observability.status', () => {
  it('reports verification, provisioning and the probed version without exposing fingerprints', async () => {
    await seedSettings({ verifiedFingerprint: observabilityConnectionFingerprint(SITE) })
    await callRpc('/admin/observability/testConnection', {}, makeAuthedCtx({ db, userId: '1', role: 'admin' }))
    await callRpc('/admin/observability/provision', {}, makeAuthedCtx({ db, userId: '1', role: 'admin' }))

    const res = await callRpc('/admin/observability/status', {}, makeAuthedCtx({ db, userId: '1', role: 'admin' }))
    expect(res.status).toBe(200)
    const status = await parseRpcJson<{
      runtime: { phase: string; lastError: string | null; lastExportError: unknown }
      verified: boolean
      provisioned: boolean
      provisionedCurrent: boolean
      version: string | null
    }>(res)

    expect(status.runtime.phase).toBe('running')
    expect(status.runtime.lastExportError).toBeNull()
    expect(status.runtime).not.toHaveProperty('fingerprint')
    expect(status.verified).toBe(true)
    expect(status.provisioned).toBe(true)
    expect(status.provisionedCurrent).toBe(true)
    expect(status.version).toBe('v1.1.2')
    expect(status).not.toHaveProperty('verifiedFingerprint')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { Database } from '@/server/infra/db/database'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { observabilityConnectionFingerprint } from '@/server/domains/observability/config'
import {
  __resetObservabilityRuntimeForTests,
  getObservabilityRuntimeStatus,
  syncObservabilityRuntime,
} from '@/server/domains/observability/runtime-manager'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const runtimeMock = vi.hoisted(() => ({
  startTraceRuntime: vi.fn(),
  stopTraceRuntime: vi.fn(),
}))

vi.mock('@/server/infra/trace/runtime', () => runtimeMock)

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
  rumClientToken: 'rum-token',
  verifiedFingerprint: '',
  provisionedFingerprint: '',
}

const VERIFIED: ObservabilitySettingsSlice = {
  ...SITE,
  verifiedFingerprint: observabilityConnectionFingerprint(SITE),
}

function seedSettings(site: ObservabilitySettingsSlice): void {
  const result = buildInstallSectionRows({ title: 'T', name: 'N', email: 'a@b.co', hostname: 'localhost' })
  if (!result.ok) {
    throw new Error(`expected install rows, got: ${result.descriptor.fallbackMessage}`)
  }
  for (const row of result.rows) {
    if (row.scope === 'blog.observability') {
      row.payload = { observability: site }
    }
  }
  seedInstallSections(db, result.rows, null)
}

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
  runtimeMock.startTraceRuntime.mockReset()
  runtimeMock.stopTraceRuntime.mockReset()
  runtimeMock.startTraceRuntime.mockResolvedValue({ started: true, shutdown: vi.fn(), forceFlush: vi.fn() })
  runtimeMock.stopTraceRuntime.mockResolvedValue(undefined)
  __resetObservabilityRuntimeForTests()
})

afterEach(() => {
  resetBlogSettingsForTests()
  __resetObservabilityRuntimeForTests()
})

// HMR can re-evaluate `shared/config/snapshot` (module-level state), so a fresh
// module graph reads back an empty settings snapshot. The boot path hydrates
// before syncing precisely so the runtime re-arms without waiting for the next
// admin save or the first browser request.
describe('observability runtime re-arm after an HMR settings-snapshot loss', () => {
  it('hydrates from the DB and starts the verified runtime', async () => {
    seedSettings(VERIFIED)
    // Simulate the re-created snapshot module: no value, no in-flight hydration.
    expect(getBlogSettingsBundleSync()).toBeNull()

    await hydrateBlogSettings(db)
    expect(getBlogSettingsBundleSync()?.observability?.observability.enabled).toBe(true)

    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
    expect(getObservabilityRuntimeStatus().phase).toBe('running')
  })

  it('is inert when the snapshot is empty and nothing hydrates first (the pre-fix hazard)', async () => {
    seedSettings(VERIFIED)

    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).not.toHaveBeenCalled()
    expect(runtimeMock.stopTraceRuntime).not.toHaveBeenCalled()
    expect(getObservabilityRuntimeStatus()).toEqual({
      phase: 'disabled',
      fingerprint: null,
      lastError: null,
      lastExportError: null,
    })
  })

  it('re-hydrates on every call: a second boot cycle still arms', async () => {
    seedSettings(VERIFIED)
    await hydrateBlogSettings(db)
    await syncObservabilityRuntime()
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)

    // A later HMR cycle re-created the snapshot module again.
    resetBlogSettingsForTests()
    expect(getBlogSettingsBundleSync()).toBeNull()

    await hydrateBlogSettings(db)
    await syncObservabilityRuntime()
    expect(getObservabilityRuntimeStatus().phase).toBe('running')
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
  })
})

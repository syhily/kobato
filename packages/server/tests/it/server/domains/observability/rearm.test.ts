import type { Database } from '@kobato/db/database.ts'
import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config.ts'

import { observabilityConnectionFingerprint } from '@kobato/server/domains/observability/config.ts'
import {
  __resetObservabilityRuntimeForTests,
  getObservabilityRuntimeStatus,
  syncObservabilityRuntime,
} from '@kobato/server/domains/observability/runtime-manager.ts'
import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { buildInstallSectionRows, seedInstallSections } from '@kobato/server/domains/settings/services/install-flow.ts'
import { resetBlogSettingsForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The OTel runtime is a process-level boundary; observe without starting it.
const runtimeMock = {
  startTraceRuntime: vi
    .spyOn(await import('@kobato/server/infra/trace/runtime.ts'), 'startTraceRuntime')
    .mockImplementation(async () => ({ shutdown: async () => {} }) as never),
  stopTraceRuntime: vi
    .spyOn(await import('@kobato/server/infra/trace/runtime.ts'), 'stopTraceRuntime')
    .mockImplementation(async () => {}),
}

const db: Database = getTestDb()

afterAll(() => {
  runtimeMock.startTraceRuntime.mockRestore()
  runtimeMock.stopTraceRuntime.mockRestore()
})

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

// HMR can re-evaluate `@kobato/settings/snapshot` (module-level state), so a fresh
// module graph reads back an empty settings snapshot. The boot path hydrates
// before syncing precisely so the runtime re-arms without waiting for the next
// admin save or the first browser request.
describe('observability runtime re-arm after an HMR settings-snapshot loss', () => {
  it('hydrates from the DB and starts the verified runtime', async () => {
    seedSettings(VERIFIED)
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

    resetBlogSettingsForTests()
    expect(getBlogSettingsBundleSync()).toBeNull()

    await hydrateBlogSettings(db)
    await syncObservabilityRuntime()
    expect(getObservabilityRuntimeStatus().phase).toBe('running')
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
  })
})

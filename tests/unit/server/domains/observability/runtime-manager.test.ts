import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'

import {
  TEST_BLOG_SETTINGS_BUNDLE,
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
} from '#/_helpers/blog-settings'
import {
  observabilityConnectionFingerprint,
  observabilityRuntimeFingerprint,
} from '@/server/domains/observability/config'
import {
  __resetObservabilityRuntimeForTests,
  getObservabilityRuntimeStatus,
  syncObservabilityRuntime,
} from '@/server/domains/observability/runtime-manager'
import {
  __resetExportHealthForTests,
  activateExportHealth,
  deactivateExportHealth,
  recordExportOutcome,
} from '@/server/infra/trace/export-health'

const runtimeMock = vi.hoisted(() => ({
  startTraceRuntime: vi.fn(),
  stopTraceRuntime: vi.fn(),
}))

vi.mock('@/server/infra/trace/runtime', () => runtimeMock)

const retentionMock = vi.hoisted(() => ({
  syncObservabilityRetention: vi.fn(),
}))

vi.mock('@/server/domains/observability/retention', () => retentionMock)

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

function seed(site: Partial<ObservabilitySettingsSlice> | null): void {
  if (site === null) {
    resetBlogSettingsForTests()
    return
  }
  const merged: ObservabilitySettingsSlice = { ...SITE, ...site }
  const bundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
  bundle.observability = { observability: merged }
  setBlogSettingsBundleForTests(bundle)
}

function verified(site: Partial<ObservabilitySettingsSlice> = {}): ObservabilitySettingsSlice {
  const merged: ObservabilitySettingsSlice = { ...SITE, ...site }
  return { ...merged, verifiedFingerprint: observabilityConnectionFingerprint(merged) }
}

/** A verified configuration whose pipeline switches are then flipped — the
 *  stored connection fingerprint stays as it was. */
function verifiedThenChanged(patch: Partial<ObservabilitySettingsSlice>): ObservabilitySettingsSlice {
  return { ...verified(), ...patch }
}

beforeEach(() => {
  runtimeMock.startTraceRuntime.mockReset()
  runtimeMock.stopTraceRuntime.mockReset()
  runtimeMock.startTraceRuntime.mockResolvedValue({ started: true, shutdown: vi.fn(), forceFlush: vi.fn() })
  runtimeMock.stopTraceRuntime.mockResolvedValue(undefined)
  retentionMock.syncObservabilityRetention.mockReset()
  retentionMock.syncObservabilityRetention.mockResolvedValue(undefined)
  __resetExportHealthForTests()
  __resetObservabilityRuntimeForTests()
})

afterEach(() => {
  resetBlogSettingsForTests()
  __resetExportHealthForTests()
  __resetObservabilityRuntimeForTests()
})

describe('observability runtime manager — activation gates', () => {
  it('never loads the runtime when the section is absent', async () => {
    seed(null)

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

  it('stops a running runtime when the snapshot disappears (HMR module re-evaluation)', async () => {
    seed(verified())
    await syncObservabilityRuntime()

    seed(null)
    await syncObservabilityRuntime()

    expect(runtimeMock.stopTraceRuntime).toHaveBeenCalledTimes(1)
    expect(getObservabilityRuntimeStatus()).toEqual({
      phase: 'disabled',
      fingerprint: null,
      lastError: null,
      lastExportError: null,
    })
  })

  it('does not start while the master switch is off', async () => {
    seed(verified({ enabled: false }))

    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).not.toHaveBeenCalled()
    expect(getObservabilityRuntimeStatus().phase).toBe('disabled')
  })

  it('does not start an enabled but unverified configuration', async () => {
    seed({ enabled: true })

    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).not.toHaveBeenCalled()
    expect(getObservabilityRuntimeStatus()).toMatchObject({
      phase: 'unverified',
      fingerprint: observabilityRuntimeFingerprint(SITE),
      lastError: null,
    })
  })

  it('reports invalid configuration without starting', async () => {
    const site = verified({ endpoint: 'http://remote.example.com' })
    seed(site)

    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).not.toHaveBeenCalled()
    const status = getObservabilityRuntimeStatus()
    expect(status.phase).toBe('invalid')
    expect(status.lastError).toContain('trace-invalid-config')
    expect(status.lastError).toContain('observability.endpoint')
  })

  it('starts once for a verified configuration and is idempotent', async () => {
    const site = verified()
    seed(site)

    await syncObservabilityRuntime()
    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
    expect(runtimeMock.stopTraceRuntime).not.toHaveBeenCalled()
    expect(getObservabilityRuntimeStatus()).toEqual({
      phase: 'running',
      fingerprint: observabilityRuntimeFingerprint(site),
      lastError: null,
      lastExportError: null,
    })
  })
})

describe('observability runtime manager — hot apply', () => {
  it('restarts when the fingerprint changes', async () => {
    seed(verified())
    await syncObservabilityRuntime()

    const changed = verified({ sampleRate: 0.25 })
    seed(changed)
    await syncObservabilityRuntime()

    expect(runtimeMock.stopTraceRuntime).toHaveBeenCalledTimes(1)
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(2)
    expect(getObservabilityRuntimeStatus().fingerprint).toBe(observabilityRuntimeFingerprint(changed))
  })

  it.each<[string, Partial<ObservabilitySettingsSlice>]>([
    ['log export switches on', { logs: { enabled: true } }],
    ['browser RUM switches on', { frontend: { enabled: true, sessionSampleRate: 100, clientIdentity: 'anonymous' } }],
    ['the snapshot sampling rate changes', { sampleRate: 0.25 }],
    ['the redacted-SQL flag changes', { includeRedactedSql: true }],
  ])('restarts without losing verification when %s', async (_label, patch) => {
    seed(verified())
    await syncObservabilityRuntime()

    seed(verifiedThenChanged(patch))
    await syncObservabilityRuntime()

    expect(runtimeMock.stopTraceRuntime).toHaveBeenCalledTimes(1)
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(2)
    expect(getObservabilityRuntimeStatus().phase).toBe('running')
  })

  it.each<[string, Partial<ObservabilitySettingsSlice>]>([
    ['endpoint', { endpoint: 'https://other.example.com' }],
    ['password', { password: 'rotated-secret' }],
    ['organization', { organization: 'other-site' }],
    ['username', { username: 'other@example.com' }],
  ])('loses verification immediately when the connection parameter %s changes', async (_label, patch) => {
    seed(verified())
    await syncObservabilityRuntime()

    seed(verifiedThenChanged(patch))
    await syncObservabilityRuntime()

    expect(getObservabilityRuntimeStatus().phase).toBe('unverified')
    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
    expect(runtimeMock.stopTraceRuntime).toHaveBeenCalledTimes(1)
  })

  it('does not restart when only the browser-side RUM token changes', async () => {
    seed(verified())
    await syncObservabilityRuntime()

    seed(verified({ rumClientToken: 'rotated-token' }))
    await syncObservabilityRuntime()

    expect(runtimeMock.startTraceRuntime).toHaveBeenCalledTimes(1)
    expect(runtimeMock.stopTraceRuntime).not.toHaveBeenCalled()
  })

  it('stops the runtime when the section is disabled again', async () => {
    seed(verified())
    await syncObservabilityRuntime()

    seed(verified({ enabled: false }))
    await syncObservabilityRuntime()

    expect(runtimeMock.stopTraceRuntime).toHaveBeenCalledTimes(1)
    expect(getObservabilityRuntimeStatus().phase).toBe('disabled')
  })

  it('passes the resolved projection (org, Basic header, RUM client token) to the runtime', async () => {
    seed(verified({ frontend: { enabled: true, sessionSampleRate: 40, clientIdentity: 'anonymous' } }))
    await syncObservabilityRuntime()

    const resolution = runtimeMock.startTraceRuntime.mock.calls[0]?.[0]?.resolution
    expect(resolution?.status).toBe('active')
    expect(resolution?.server).toMatchObject({
      endpoint: 'https://obs.example.com',
      organization: 'my-site',
      authorizationHeader: `Basic ${Buffer.from('admin@example.com:secret').toString('base64')}`,
    })
    expect(resolution?.frontend).toMatchObject({
      applicationId: 'my-site',
      service: 'kobato',
      sessionSampleRate: 40,
    })
    expect(resolution?.frontendRelay).toEqual({
      endpoint: 'https://obs.example.com',
      organization: 'my-site',
      clientToken: 'rum-token',
      clientIdentity: 'anonymous',
    })
  })
})

describe('observability runtime manager — failure isolation', () => {
  it('records a thrown start failure and keeps the site running', async () => {
    runtimeMock.startTraceRuntime.mockRejectedValueOnce(new TypeError('chunk load failed'))
    seed(verified())

    await expect(syncObservabilityRuntime()).resolves.toBeUndefined()

    const status = getObservabilityRuntimeStatus()
    expect(status.phase).toBe('failed')
    expect(status.lastError).toContain('trace-start-failed')
    expect(status.lastError).toContain('TypeError')
  })

  it('treats an inert handle as a provider start failure', async () => {
    runtimeMock.startTraceRuntime.mockResolvedValueOnce({ started: false, shutdown: vi.fn(), forceFlush: vi.fn() })
    seed(verified())

    await syncObservabilityRuntime()

    expect(getObservabilityRuntimeStatus()).toMatchObject({
      phase: 'failed',
      lastError: 'trace-provider-start-failed',
    })
  })
})

describe('observability runtime manager — export health', () => {
  it('surfaces the latest OTLP export failure the running runtime observed', async () => {
    const token = {}
    activateExportHealth(token)
    recordExportOutcome(token, 'traces', false, new TypeError('connect ECONNREFUSED'))
    seed(verified())

    await syncObservabilityRuntime()

    const status = getObservabilityRuntimeStatus()
    expect(status.phase).toBe('running')
    expect(status.lastExportError).toMatchObject({ signal: 'traces', error: 'TypeError' })
    expect(JSON.stringify(status.lastExportError)).not.toContain('ECONNREFUSED')
    deactivateExportHealth(token)
  })
})

describe('observability runtime manager — post-start retention pass', () => {
  it('runs one delayed retention pass after the runtime enters running', async () => {
    vi.useFakeTimers()
    try {
      seed(verified())
      await syncObservabilityRuntime()
      expect(retentionMock.syncObservabilityRetention).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(60_000)
      expect(retentionMock.syncObservabilityRetention).toHaveBeenCalledTimes(1)

      // No further pass is scheduled by the timer itself.
      await vi.advanceTimersByTimeAsync(120_000)
      expect(retentionMock.syncObservabilityRetention).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the scheduled pass when the runtime stops before it fires', async () => {
    vi.useFakeTimers()
    try {
      seed(verified())
      await syncObservabilityRuntime()

      seed(verified({ enabled: false }))
      await syncObservabilityRuntime()

      await vi.advanceTimersByTimeAsync(120_000)
      expect(retentionMock.syncObservabilityRetention).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reschedules against the latest start when the runtime restarts', async () => {
    vi.useFakeTimers()
    try {
      seed(verified())
      await syncObservabilityRuntime()

      // A fingerprint change restarts the runtime; the first pass is replaced,
      // so the retention sync still runs exactly once.
      await vi.advanceTimersByTimeAsync(30_000)
      seed(verified({ sampleRate: 0.25 }))
      await syncObservabilityRuntime()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(retentionMock.syncObservabilityRetention).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'

import {
  TEST_BLOG_SETTINGS_BUNDLE,
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
} from '#/_helpers/blog-settings'
import { observabilityConnectionFingerprint } from '@/server/domains/observability/config'

const clientMock = vi.hoisted(() => ({
  listStreams: vi.fn(),
  setStreamRetention: vi.fn(),
  createO2Client: vi.fn(),
}))

vi.mock('@/server/domains/observability/o2-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/server/domains/observability/o2-client')>()
  return { ...original, createO2Client: clientMock.createO2Client }
})

import { O2ClientError } from '@/server/domains/observability/o2-client'
import {
  __resetObservabilityRetentionForTests,
  isKobatoOwnedStream,
  syncObservabilityRetention,
} from '@/server/domains/observability/retention'

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

function verified(patch: Partial<ObservabilitySettingsSlice>): ObservabilitySettingsSlice {
  const merged: ObservabilitySettingsSlice = { ...SITE, ...patch }
  return { ...merged, verifiedFingerprint: observabilityConnectionFingerprint(merged) }
}

function streamList(entries: Record<string, Array<{ name: string; retentionDays: number | null }>>) {
  clientMock.listStreams.mockImplementation(async (type: string) => entries[type] ?? [])
}

beforeEach(() => {
  clientMock.listStreams.mockReset()
  clientMock.setStreamRetention.mockReset()
  clientMock.createO2Client.mockReset()
  clientMock.listStreams.mockResolvedValue([])
  clientMock.setStreamRetention.mockResolvedValue(undefined)
  clientMock.createO2Client.mockReturnValue({
    listStreams: clientMock.listStreams,
    setStreamRetention: clientMock.setStreamRetention,
  })
  __resetObservabilityRetentionForTests()
})

afterEach(() => {
  resetBlogSettingsForTests()
  __resetObservabilityRetentionForTests()
})

describe('isKobatoOwnedStream', () => {
  it('owns the RUM, traces, logs and closed metric streams only', () => {
    expect(isKobatoOwnedStream('_rumdata')).toBe(true)
    expect(isKobatoOwnedStream('default')).toBe(true)
    expect(isKobatoOwnedStream('kobato_logs')).toBe(true)
    expect(isKobatoOwnedStream('http_server_duration_count')).toBe(true)
    expect(isKobatoOwnedStream('event_loop_delay')).toBe(true)
    expect(isKobatoOwnedStream('other_app_logs')).toBe(false)
    expect(isKobatoOwnedStream('journalctl')).toBe(false)
  })
})

describe('observability retention sync — gates', () => {
  it('never builds a client without a saved section', async () => {
    seed(null)
    await syncObservabilityRetention()
    expect(clientMock.createO2Client).not.toHaveBeenCalled()
  })

  it('never builds a client while the connection is unverified', async () => {
    seed({ retentionDays: 7, verifiedFingerprint: '' })
    await syncObservabilityRetention()
    expect(clientMock.createO2Client).not.toHaveBeenCalled()
  })

  it('is a no-op while retentionDays is 0 (the operator owns the policy)', async () => {
    seed(verified({ retentionDays: 0 }))
    await syncObservabilityRetention()
    expect(clientMock.createO2Client).not.toHaveBeenCalled()
  })

  it('applies even while the master switch is off — retention is a data policy', async () => {
    seed(verified({ enabled: false, retentionDays: 7 }))
    await syncObservabilityRetention()
    expect(clientMock.createO2Client).toHaveBeenCalledTimes(1)
  })
})

describe('observability retention sync — application', () => {
  it('writes only drifted Kobato-owned streams across all three types', async () => {
    seed(verified({ retentionDays: 7 }))
    streamList({
      logs: [
        { name: '_rumdata', retentionDays: 3 },
        { name: 'kobato_logs', retentionDays: 7 },
        { name: 'other_app', retentionDays: 3 },
      ],
      traces: [{ name: 'default', retentionDays: null }],
      metrics: [
        { name: 'http_server_duration_count', retentionDays: 1 },
        { name: 'unrelated_metric', retentionDays: 1 },
      ],
    })

    await syncObservabilityRetention()

    expect(clientMock.listStreams.mock.calls).toEqual([['logs'], ['traces'], ['metrics']])
    expect(clientMock.setStreamRetention.mock.calls).toEqual([
      ['_rumdata', 'logs', 7],
      ['default', 'traces', 7],
      ['http_server_duration_count', 'metrics', 7],
    ])
  })

  it('converges: a second pass with matching retention writes nothing', async () => {
    seed(verified({ retentionDays: 7 }))
    streamList({ logs: [{ name: '_rumdata', retentionDays: 7 }] })

    await syncObservabilityRetention()

    expect(clientMock.setStreamRetention).not.toHaveBeenCalled()
  })

  it('never rejects on an OpenObserve failure and retries on the next pass', async () => {
    seed(verified({ retentionDays: 7 }))
    streamList({ logs: [{ name: '_rumdata', retentionDays: 1 }] })
    clientMock.setStreamRetention.mockRejectedValueOnce(new O2ClientError('network', 'streams'))

    await expect(syncObservabilityRetention()).resolves.toBeUndefined()
    await expect(syncObservabilityRetention()).resolves.toBeUndefined()

    expect(clientMock.setStreamRetention).toHaveBeenCalledTimes(2)
  })

  it('serializes overlapping passes; the queued pass reads the latest snapshot', async () => {
    seed(verified({ retentionDays: 7 }))
    streamList({
      logs: [{ name: '_rumdata', retentionDays: 1 }],
    })

    const first = syncObservabilityRetention()
    // The first pass has started (and read 7) before the second save lands.
    await vi.waitFor(() => expect(clientMock.listStreams).toHaveBeenCalled())
    seed(verified({ retentionDays: 30 }))
    const second = syncObservabilityRetention()
    await Promise.all([first, second])

    expect(clientMock.setStreamRetention.mock.calls.map((call) => call[2])).toEqual([7, 30])
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { O2Client } from '@/server/domains/observability/o2-client'

import { getObservabilityAssets, observabilityAssetFingerprint } from '@/server/domains/observability/assets'
import { observabilityConnectionFingerprint } from '@/server/domains/observability/config'
import { testObservabilityConnection } from '@/server/domains/observability/connection'
import { O2ClientError } from '@/server/domains/observability/o2-client'
import {
  runObservabilityProvisioning,
  upgradeObservabilityProvisioningAtBoot,
} from '@/server/domains/observability/provision'
import { DomainError } from '@/server/infra/http/errors'

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

function verified(site: ObservabilitySettingsSlice = SITE): ObservabilitySettingsSlice {
  return { ...site, verifiedFingerprint: observabilityConnectionFingerprint(site) }
}

interface FakeClient extends O2Client {
  calls: {
    ensureOrganization: ReturnType<typeof vi.fn>
    createRumToken: ReturnType<typeof vi.fn>
    getRumToken: ReturnType<typeof vi.fn>
    upsertFunction: ReturnType<typeof vi.fn>
    upsertPipeline: ReturnType<typeof vi.fn>
    upsertDashboard: ReturnType<typeof vi.fn>
  }
}

function fakeClient(overrides: Partial<O2Client> = {}): FakeClient {
  const calls = {
    ensureOrganization: vi.fn(async () => 'created' as const),
    createRumToken: vi.fn(async () => 'rum-new'),
    getRumToken: vi.fn(async () => null),
    upsertFunction: vi.fn(async () => undefined),
    upsertPipeline: vi.fn(async () => 'pid'),
    upsertDashboard: vi.fn(async () => 'dash'),
  }
  return {
    calls,
    health: vi.fn(async () => undefined),
    listOrganizations: vi.fn(async () => []),
    getVersion: vi.fn(async () => 'v1.1.2'),
    ...calls,
    ...overrides,
  } as FakeClient
}

describe('observability provisioning', () => {
  it('provisions the token, privacy pipeline and all four dashboards on the first run', async () => {
    const assets = getObservabilityAssets()
    const client = fakeClient()
    const persist = vi.fn(async () => undefined)

    const result = await runObservabilityProvisioning({
      client,
      organization: 'my-site',
      currentRumToken: '',
      persist,
    })

    expect(result).toEqual({
      organization: 'created',
      rumToken: 'created',
      pipeline: 'installed',
      dashboards: 4,
      provisionedFingerprint: assets.fingerprint,
    })
    expect(client.calls.createRumToken).toHaveBeenCalledTimes(1)
    expect(client.calls.upsertFunction).toHaveBeenCalledWith({
      name: 'kobato_rum_privacy_drop',
      function: assets.vrl,
      transType: 0,
    })
    expect(client.calls.upsertPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'kobato_rum_privacy', enabled: true }),
    )
    expect(client.calls.upsertDashboard).toHaveBeenCalledTimes(4)
    expect(persist.mock.calls).toEqual([
      [{ rumClientToken: 'rum-new' }],
      [{ provisionedFingerprint: assets.fingerprint }],
    ])
  })

  it('reuses a matching token and is idempotent', async () => {
    const client = fakeClient({ getRumToken: vi.fn(async () => 'rum-existing') } as Partial<O2Client>)
    const persist = vi.fn(async () => undefined)

    const result = await runObservabilityProvisioning({
      client,
      organization: 'my-site',
      currentRumToken: 'rum-existing',
      persist,
    })

    expect(result.rumToken).toBe('exists')
    expect(client.calls.createRumToken).not.toHaveBeenCalled()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0]).toEqual([{ provisionedFingerprint: getObservabilityAssets().fingerprint }])
  })

  it('rotates a token that no longer matches the OpenObserve side', async () => {
    const client = fakeClient({ getRumToken: vi.fn(async () => 'rum-old') } as Partial<O2Client>)
    const persist = vi.fn(async () => undefined)

    const result = await runObservabilityProvisioning({
      client,
      organization: 'my-site',
      currentRumToken: 'rum-other',
      persist,
    })

    expect(result.rumToken).toBe('created')
    expect(client.calls.createRumToken).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0]).toEqual([{ rumClientToken: 'rum-new' }])
  })

  it('propagates a step failure as the classified domain error and never writes the fingerprint', async () => {
    const client = fakeClient({
      upsertPipeline: vi.fn(async () => {
        throw new O2ClientError('forbidden', 'pipelines', 403)
      }),
    } as Partial<O2Client>)
    const persist = vi.fn(async () => undefined)

    const error = await runObservabilityProvisioning({
      client,
      organization: 'my-site',
      currentRumToken: 'rum-existing',
      persist,
    }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).descriptor?.messageKey).toBe('admin.settings.observability.error.forbidden')
    expect(persist).not.toHaveBeenCalledWith(expect.objectContaining({ provisionedFingerprint: expect.anything() }))
  })

  it('keeps the asset fingerprint deterministic and content-sensitive', () => {
    const a = observabilityAssetFingerprint(['vrl', '{"a":1}'])
    expect(observabilityAssetFingerprint(['vrl', '{"a":1}'])).toBe(a)
    expect(observabilityAssetFingerprint(['vrl', '{"a":2}'])).not.toBe(a)
  })
})

describe('connection test', () => {
  it('runs health, auth, organization and version in order', async () => {
    const client = fakeClient()
    const result = await testObservabilityConnection(SITE, () => client)
    expect(result).toEqual({ organization: 'created', version: 'v1.1.2' })
    expect(client.calls.ensureOrganization).toHaveBeenCalledTimes(1)
  })

  it('rejects an incomplete configuration before any request', async () => {
    const factory = vi.fn()
    const error = await testObservabilityConnection({ ...SITE, password: '' }, factory).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).descriptor).toMatchObject({
      messageKey: 'admin.settings.observability.error.incomplete',
      params: { field: 'password' },
    })
    expect(factory).not.toHaveBeenCalled()
  })
})

describe('boot upgrade', () => {
  it('is a no-op when the stored fingerprint matches the bundled assets', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await upgradeObservabilityProvisioningAtBoot({
        site: { ...verified(), provisionedFingerprint: getObservabilityAssets().fingerprint },
        writeSettings: vi.fn(async () => undefined),
      })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('swallows a failed upgrade for a stale fingerprint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    )
    try {
      await expect(
        upgradeObservabilityProvisioningAtBoot({
          site: { ...verified(), provisionedFingerprint: 'stale' },
          writeSettings: vi.fn(async () => undefined),
        }),
      ).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('is inert for an unverified configuration', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await upgradeObservabilityProvisioningAtBoot({
        site: { ...SITE, provisionedFingerprint: 'stale' },
        writeSettings: vi.fn(async () => undefined),
      })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

import { describe, expect, it } from 'vitest'

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'

import {
  basicAuthorizationHeader,
  observabilityConnectionFingerprint,
  observabilityRuntimeFingerprint,
  toTraceRuntimeSettings,
} from '@/server/domains/observability/config'

const BASE: ObservabilitySettingsSlice = {
  enabled: true,
  endpoint: 'https://obs.example.com',
  organization: 'my-site',
  username: 'admin@example.com',
  password: 'secret',
  sampleRate: 1,
  includeRedactedSql: false,
  logs: { enabled: false },
  frontend: { enabled: false, sessionSampleRate: 100 },
  rumClientToken: 'rum-token',
  verifiedFingerprint: '',
  provisionedFingerprint: '',
}

describe('observability connection fingerprint', () => {
  it('is a stable keyed digest of the connection parameters', () => {
    expect(observabilityConnectionFingerprint(BASE)).toBe(observabilityConnectionFingerprint(structuredClone(BASE)))
    expect(observabilityConnectionFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each<[string, Partial<ObservabilitySettingsSlice>]>([
    ['endpoint', { endpoint: 'https://other.example.com' }],
    ['organization', { organization: 'other-site' }],
    ['username', { username: 'other@example.com' }],
    ['password', { password: 'rotated' }],
  ])('changes when the connection parameter %s changes', (_label, patch) => {
    expect(observabilityConnectionFingerprint({ ...BASE, ...patch })).not.toBe(observabilityConnectionFingerprint(BASE))
  })

  it('ignores every pipeline switch and sampling rate (verified first, toggled later)', () => {
    const baseline = observabilityConnectionFingerprint(BASE)
    for (const patch of [
      { enabled: false },
      { sampleRate: 0.25 },
      { includeRedactedSql: true },
      { logs: { enabled: true } },
      { frontend: { enabled: true, sessionSampleRate: 25 } },
      { rumClientToken: 'rotated-token' },
    ] satisfies Partial<ObservabilitySettingsSlice>[]) {
      expect(observabilityConnectionFingerprint({ ...BASE, ...patch })).toBe(baseline)
    }
  })

  it('treats an absent password as empty', () => {
    expect(observabilityConnectionFingerprint({ ...BASE, password: undefined })).toBe(
      observabilityConnectionFingerprint({ ...BASE, password: '' }),
    )
  })
})

describe('observability runtime fingerprint', () => {
  it('is a stable keyed digest distinct from the connection fingerprint', () => {
    expect(observabilityRuntimeFingerprint(BASE)).toBe(observabilityRuntimeFingerprint(structuredClone(BASE)))
    expect(observabilityRuntimeFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/)
    expect(observabilityRuntimeFingerprint(BASE)).not.toBe(observabilityConnectionFingerprint(BASE))
  })

  it.each<[string, Partial<ObservabilitySettingsSlice>]>([
    ['endpoint', { endpoint: 'https://other.example.com' }],
    ['organization', { organization: 'other-site' }],
    ['username', { username: 'other@example.com' }],
    ['password', { password: 'rotated' }],
    ['sampleRate', { sampleRate: 0.5 }],
    ['includeRedactedSql', { includeRedactedSql: true }],
    ['logs.enabled', { logs: { enabled: true } }],
    ['frontend.enabled', { frontend: { enabled: true, sessionSampleRate: 100 } }],
    ['frontend.sessionSampleRate', { frontend: { enabled: false, sessionSampleRate: 50 } }],
  ])('changes when the pipeline setting %s changes', (_label, patch) => {
    expect(observabilityRuntimeFingerprint({ ...BASE, ...patch })).not.toBe(observabilityRuntimeFingerprint(BASE))
  })

  it('ignores the master switch and the browser-only client token', () => {
    expect(observabilityRuntimeFingerprint({ ...BASE, enabled: false })).toBe(observabilityRuntimeFingerprint(BASE))
    expect(observabilityRuntimeFingerprint({ ...BASE, rumClientToken: 'rotated-token' })).toBe(
      observabilityRuntimeFingerprint(BASE),
    )
  })
})

describe('basicAuthorizationHeader', () => {
  it('composes the HTTP Basic value from username and password', () => {
    expect(basicAuthorizationHeader('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
  })

  it('returns null while either half is missing', () => {
    expect(basicAuthorizationHeader('user', '')).toBeNull()
    expect(basicAuthorizationHeader('', 'pass')).toBeNull()
    expect(basicAuthorizationHeader('', '')).toBeNull()
  })
})

describe('toTraceRuntimeSettings', () => {
  it('maps the site name to the organization and RUM application id', () => {
    const input = toTraceRuntimeSettings({
      ...BASE,
      logs: { enabled: true },
      frontend: { enabled: true, sessionSampleRate: 20 },
    })

    expect(input).toEqual({
      enabled: true,
      endpoint: 'https://obs.example.com',
      organization: 'my-site',
      authorizationHeader: basicAuthorizationHeader('admin@example.com', 'secret'),
      sampleRate: 1,
      includeRedactedSql: false,
      logs: { enabled: true },
      frontend: {
        enabled: true,
        applicationId: 'my-site',
        clientToken: 'rum-token',
        sessionSampleRate: 20,
      },
    })
  })

  it('leaves the credential empty when the pair is incomplete', () => {
    expect(toTraceRuntimeSettings({ ...BASE, password: undefined }).authorizationHeader).toBe('')
    expect(toTraceRuntimeSettings({ ...BASE, password: undefined }).frontend.clientToken).toBe('rum-token')
  })
})

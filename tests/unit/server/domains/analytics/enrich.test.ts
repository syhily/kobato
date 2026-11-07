import { describe, expect, it } from 'vitest'

import type { RawAccessEvent } from '@/server/domains/analytics/types'

import { buildDeviceEnvServerRow } from '@/server/domains/analytics/enrich'

// `device_env_server` row construction is pure: it maps the request's
// client hints + Accept-Language onto the sidecar columns (ADR-0006).

function makeRaw(overrides: Partial<RawAccessEvent> = {}): RawAccessEvent {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    ts: new Date('2026-01-01T00:00:00Z'),
    ip: '127.0.0.1',
    ua: '',
    path: '/',
    referer: null,
    acceptLanguage: null,
    target: null,
    ...overrides,
  }
}

describe('buildDeviceEnvServerRow', () => {
  it('maps every client hint onto its column', () => {
    const row = buildDeviceEnvServerRow(
      makeRaw({
        acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
        clientHints: {
          model: 'MacBook Pro',
          platform: '"macOS"',
          platformVersion: '15.1.0',
          mobile: '?0',
          brands: '"Chromium";v="141.0.7390.55"',
          fullVersion: '141.0.7390.55',
          arch: '"arm"',
          bitness: '64',
          formFactors: '"Desktop", "Laptop"',
        },
      }),
    )

    expect(row).toEqual({
      eventId: '00000000-0000-4000-8000-000000000001',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      uaFullVersion: '141.0.7390.55',
      platform: '"macOS"',
      platformVersion: '15.1.0',
      model: 'MacBook Pro',
      mobile: false,
      brands: '"Chromium";v="141.0.7390.55"',
      arch: '"arm"',
      bitness: '64',
      formFactors: '"Desktop", "Laptop"',
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
    })
  })

  it('degrades a hint-less first hit to empty strings and a NULL mobile flag', () => {
    const row = buildDeviceEnvServerRow(makeRaw())

    expect(row).toEqual({
      eventId: '00000000-0000-4000-8000-000000000001',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      uaFullVersion: '',
      platform: '',
      platformVersion: '',
      model: '',
      mobile: null,
      brands: '',
      arch: '',
      bitness: '',
      formFactors: '',
      acceptLanguage: '',
    })
  })

  it('reads the structured mobile boolean and ignores malformed values', () => {
    expect(buildDeviceEnvServerRow(makeRaw({ clientHints: { mobile: '?1' } })).mobile).toBe(true)
    expect(buildDeviceEnvServerRow(makeRaw({ clientHints: { mobile: '?0' } })).mobile).toBe(false)
    expect(buildDeviceEnvServerRow(makeRaw({ clientHints: { mobile: '1' } })).mobile).toBeNull()
  })

  it('truncates the raw form-factors header to 128 and Accept-Language to 256', () => {
    const row = buildDeviceEnvServerRow(
      makeRaw({
        acceptLanguage: 'x'.repeat(400),
        clientHints: { formFactors: 'y'.repeat(400) },
      }),
    )

    expect(row.formFactors).toHaveLength(128)
    expect(row.acceptLanguage).toHaveLength(256)
  })
})

import type { RawAccessEvent } from '@kobato/server/domains/analytics/types.ts'

import { buildDeviceEnvServerRow, enrichEvent } from '@kobato/server/domains/analytics/enrich.ts'
import { describe, expect, it } from 'vitest'

// The enrichment pipeline (salted IP hash, referer minimization, UA parsing,
// bot detection) against no mocks — split from the DuckDB query coverage suite
// that shares this file's origin.

describe('analytics/enrich — enrichEvent', () => {
  it('hashes the IP, parses referer + language, and detects bots', async () => {
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
      path: '/post/1',
      referer: 'https://example.com/page',
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      target: { type: 'post', ownerId: 1 },
    })
    expect(event.visitorHash).toMatch(/^[a-f0-9]{32}$/)
    expect(event.refererHost).toBe('example.com')
    expect(event.language).toBe('zh-CN')
    expect(event.isBot).toBe(true)
    expect(event.entityType).toBe('post')
    expect(event.entityId).toBe(1)
  })

  it('fills os/browser/browserType/device/deviceType from the user agent', async () => {
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.os).toBe('iOS')
    expect(event.browser).toBe('Mobile Safari')
    expect(event.device).toBe('iPhone')
    expect(event.deviceType).toBe('mobile')
    expect(event.isBot).toBe(false)
  })

  it('marks crawler/fetcher browser types as bots even when the hand-rolled matcher misses them', async () => {
    // ia_archiver trips the ua-parser crawler extension, not kobato's is-bot list.
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'ia_archiver',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.browserType).toBe('crawler')
    expect(event.isBot).toBe(true)
  })

  it('strips query, hash and userinfo from the persisted referer', async () => {
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '127.0.0.1',
      ua: '',
      path: '/',
      referer: 'https://user:pw@example.com/page?token=secret&q=1#frag',
      acceptLanguage: null,
      target: null,
    })
    expect(event.referer).toBe('https://example.com/page')
    expect(event.referer).not.toContain('token')
    expect(event.refererHost).toBe('example.com')
  })

  it('returns null fields when referer is malformed', async () => {
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '',
      ua: 'curl/7.0',
      path: '/',
      referer: 'not-a-url',
      acceptLanguage: null,
      target: null,
    })
    expect(event.refererHost).toBeNull()
    expect(event.referer).toBeNull()
    expect(event.language).toBeNull()
  })

  it('returns null refererHost when referer is missing', async () => {
    const event = await enrichEvent({
      eventId: '00000000-0000-4000-8000-0000000000ef',
      ts: new Date(),
      ip: '1.1.1.1',
      ua: '',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.refererHost).toBeNull()
    expect(event.isBot).toBe(false)
  })
})

// Row construction is pure: request client hints + Accept-Language map onto sidecar columns.

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

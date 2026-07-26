import { describe, expect, it } from 'vitest'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { csvRow } from '@/server/domains/analytics/services/batcher'
import { csvEscape } from '@/server/infra/csv'

describe('csvEscape', () => {
  it('returns \\N for null', () => {
    expect(csvEscape(null)).toBe('\\N')
  })

  it('returns \\N for undefined', () => {
    expect(csvEscape(undefined)).toBe('\\N')
  })

  it('returns plain string unchanged', () => {
    expect(csvEscape('hello')).toBe('hello')
  })

  it('quotes string with comma', () => {
    expect(csvEscape('hello, world')).toBe('"hello, world"')
  })

  it('doubles quotes and wraps in quotes when string contains quote', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""')
  })

  it('quotes string with newline', () => {
    expect(csvEscape('hello\nworld')).toBe('"hello\nworld"')
  })

  it('stringifies number', () => {
    expect(csvEscape(42)).toBe('42')
  })
})

describe('csvRow', () => {
  it('produces 24 columns for a complete event', () => {
    const event: EnrichedAccessEvent = {
      ts: new Date('2026-01-01T00:00:00.000Z'),
      visitorHash: 'hash1',
      sessionId: 'sess1',
      ip: '127.0.0.1',
      path: '/',
      entityType: 'post',
      entityId: 1n,
      referer: 'https://example.com',
      refererHost: 'example.com',
      country: 'CN',
      region: 'Beijing',
      city: 'Beijing',
      latitude: 39.9,
      longitude: 116.4,
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      ua: 'Mozilla/5.0',
      browser: 'Chrome',
      browserVersion: '120',
      os: 'macOS',
      osVersion: '14',
      device: 'Mac',
      deviceType: 'desktop',
      isBot: false,
    }
    const row = csvRow(event)
    const cols = row.trimEnd().split(',')
    expect(cols).toHaveLength(24)
  })

  it('ends with a newline', () => {
    const event: EnrichedAccessEvent = {
      ts: new Date('2026-01-01T00:00:00.000Z'),
      visitorHash: 'hash1',
      sessionId: null,
      ip: null,
      path: '/',
      entityType: null,
      entityId: null,
      referer: null,
      refererHost: null,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      language: null,
      ua: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      device: null,
      deviceType: null,
      isBot: false,
    }
    const row = csvRow(event)
    expect(row.endsWith('\n')).toBe(true)
  })

  it('renders null fields as \\N', () => {
    const event: EnrichedAccessEvent = {
      ts: new Date('2026-01-01T00:00:00.000Z'),
      visitorHash: 'hash1',
      sessionId: null,
      ip: null,
      path: '/',
      entityType: null,
      entityId: null,
      referer: null,
      refererHost: null,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      language: null,
      ua: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      device: null,
      deviceType: null,
      isBot: false,
    }
    const row = csvRow(event)
    const cols = row.trimEnd().split(',')
    const nullCount = cols.filter((c) => c === '\\N').length
    expect(nullCount).toBe(20)
  })
})

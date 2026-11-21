import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-input'
import { describe, expect, it } from 'vitest'

describe('analytics/query-input — parseAnalyticsSearch', () => {
  it('parses explicit startAt/endAt as unix seconds', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '1000', endAt: '2000' }))
    expect(input.range).toEqual({ startAt: 1000, endAt: 2000 })
  })

  it('falls back to last-7d when startAt/endAt are not finite numbers', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: 'abc', endAt: 'xyz' }))
    expect(input.range.startAt).toBeLessThan(input.range.endAt)
  })

  it('falls back to last-7d when endAt is not strictly greater than startAt', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '2000', endAt: '1000' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('computes range from a recognized preset', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ preset: 'today' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('falls back to last-7d for an unknown preset', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ preset: 'bogus' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('falls back to last-7d with no params at all', () => {
    const input = parseAnalyticsSearch(new URLSearchParams())
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('parses direct dimension params (Slite-style)', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ country: 'US,CN', browser: 'Chrome' }))
    expect(input.country).toBe('US,CN')
    expect(input.browser).toBe('Chrome')
  })

  it('drops poisonous dimension params but keeps the range', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '1000', endAt: '2000', country: 'safe\nunsafe' }))
    expect(input.range).toEqual({ startAt: 1000, endAt: 2000 })
    expect(input.country).toBeUndefined()
  })

  it('extracts entityType and entityId when both are valid', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'post', entityId: '42' }))
    expect(input.entityType).toBe('post')
    expect(input.entityId).toBe(42)
  })

  it('ignores an unknown entityType', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'tag', entityId: '1' }))
    expect(input.entityType).toBeUndefined()
  })

  it('parses unit and clientTimezone', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ unit: 'hour', clientTimezone: 'Asia/Shanghai' }))
    expect(input.unit).toBe('hour')
    expect(input.clientTimezone).toBe('Asia/Shanghai')
  })

  it('parses includeUnknown only for the literal true', () => {
    expect(parseAnalyticsSearch(new URLSearchParams({ includeUnknown: 'true' })).includeUnknown).toBe(true)
    expect(parseAnalyticsSearch(new URLSearchParams({ includeUnknown: 'false' })).includeUnknown).toBe(false)
    expect(parseAnalyticsSearch(new URLSearchParams()).includeUnknown).toBeUndefined()
  })
})

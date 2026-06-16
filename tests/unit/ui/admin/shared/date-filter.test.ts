import { describe, expect, it } from 'vitest'

import { dateFilterLabel, parseDateFilter, resolveDateFilterBounds } from '@/ui/admin/shared/date-filter'

describe('parseDateFilter', () => {
  it('returns null for empty string', () => {
    expect(parseDateFilter('')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseDateFilter(undefined)).toBeNull()
  })

  it('returns null for both empty from and to', () => {
    expect(parseDateFilter(JSON.stringify({ from: '', to: '' }))).toBeNull()
  })

  it('parses from date only', () => {
    expect(parseDateFilter(JSON.stringify({ from: '2026-01-01', to: '' }))).toEqual({
      from: '2026-01-01',
      to: '',
    })
  })

  it('parses to date only', () => {
    expect(parseDateFilter(JSON.stringify({ from: '', to: '2026-12-31' }))).toEqual({
      from: '',
      to: '2026-12-31',
    })
  })

  it('parses both dates', () => {
    expect(parseDateFilter(JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('returns null for invalid json', () => {
    expect(parseDateFilter('not-json')).toBeNull()
  })

  it('returns null for non-object json', () => {
    expect(parseDateFilter(JSON.stringify([1, 2, 3]))).toBeNull()
  })

  it('treats missing from/to as empty strings', () => {
    expect(parseDateFilter(JSON.stringify({ other: 'value' }))).toBeNull()
  })
})

describe('dateFilterLabel', () => {
  it('returns 时间 when both dates are empty', () => {
    expect(dateFilterLabel({ from: '', to: '' })).toBe('时间')
  })

  it('shows from-only label', () => {
    expect(dateFilterLabel({ from: '2026-01-01', to: '' })).toBe('自 2026-01-01')
  })

  it('shows to-only label', () => {
    expect(dateFilterLabel({ from: '', to: '2026-12-31' })).toBe('至 2026-12-31')
  })

  it('shows range label', () => {
    expect(dateFilterLabel({ from: '2026-01-01', to: '2026-12-31' })).toBe('2026-01-01 ~ 2026-12-31')
  })
})

describe('resolveDateFilterBounds', () => {
  it('returns undefined bounds for null', () => {
    expect(resolveDateFilterBounds(null)).toEqual({ from: undefined, to: undefined })
  })

  it('returns undefined for empty strings', () => {
    expect(resolveDateFilterBounds({ from: '', to: '' })).toEqual({ from: undefined, to: undefined })
  })

  it('returns only non-empty bounds', () => {
    expect(resolveDateFilterBounds({ from: '2026-01-01', to: '' })).toEqual({
      from: '2026-01-01',
      to: undefined,
    })
  })
})

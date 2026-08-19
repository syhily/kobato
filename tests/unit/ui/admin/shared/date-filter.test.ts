import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SINGLE_DATE_OPERATOR,
  dateFilterLabel,
  isSingleDateFilterOperator,
  parseDateFilter,
  parseSingleDateFilter,
  resolveSingleDateFilterBounds,
  SINGLE_DATE_FILTER_OPERATORS,
  singleDateFilterLabel,
} from '@/ui/admin/shared/date-filter'

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

// Single-day filter mode with Ghost-style operators.

describe('parseSingleDateFilter', () => {
  it('returns null for undefined or empty input', () => {
    expect(parseSingleDateFilter(undefined)).toBeNull()
    expect(parseSingleDateFilter('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseSingleDateFilter('not-json')).toBeNull()
    expect(parseSingleDateFilter('{')).toBeNull()
  })

  it('returns null for non-object JSON', () => {
    expect(parseSingleDateFilter(JSON.stringify([1, 2, 3]))).toBeNull()
  })

  it('returns null when the date or op is missing', () => {
    expect(parseSingleDateFilter('{}')).toBeNull()
    expect(parseSingleDateFilter(JSON.stringify({ op: 'is-less' }))).toBeNull()
    expect(parseSingleDateFilter(JSON.stringify({ date: '2026-06-01' }))).toBeNull()
  })

  it('returns null for an unknown operator', () => {
    expect(parseSingleDateFilter(JSON.stringify({ date: '2026-06-01', op: 'bogus' }))).toBeNull()
    expect(parseSingleDateFilter('{"date":"2024-01-01","op":"invalid"}')).toBeNull()
  })

  it('parses a well-formed {date, op} payload', () => {
    expect(parseSingleDateFilter(JSON.stringify({ date: '2026-06-01', op: 'is-or-less' }))).toEqual({
      date: '2026-06-01',
      op: 'is-or-less',
    })
  })
})

describe('isSingleDateFilterOperator', () => {
  it('accepts the four Ghost operators', () => {
    for (const op of SINGLE_DATE_FILTER_OPERATORS) {
      expect(isSingleDateFilterOperator(op.value)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isSingleDateFilterOperator('is')).toBe(false)
    expect(isSingleDateFilterOperator('invalid')).toBe(false)
    expect(isSingleDateFilterOperator(null)).toBe(false)
    expect(isSingleDateFilterOperator(undefined)).toBe(false)
    expect(isSingleDateFilterOperator(42)).toBe(false)
  })
})

describe('singleDateFilterLabel', () => {
  it('renders `<operator-label> <date>` for the four operators', () => {
    expect(singleDateFilterLabel({ date: '2026-06-01', op: 'is-less' })).toBe('之前 2026-06-01')
    expect(singleDateFilterLabel({ date: '2026-06-01', op: 'is-or-less' })).toBe('不晚于 2026-06-01')
    expect(singleDateFilterLabel({ date: '2026-06-01', op: 'is-greater' })).toBe('之后 2026-06-01')
    expect(singleDateFilterLabel({ date: '2026-06-01', op: 'is-or-greater' })).toBe('不早于 2026-06-01')
  })
})

describe('resolveSingleDateFilterBounds', () => {
  // Expected bounds are built in the runner's local timezone, like the SUT.
  function expectedBounds(date: string) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  it('returns no bounds for a null filter', () => {
    expect(resolveSingleDateFilterBounds(null)).toEqual({ after: undefined, before: undefined })
  })

  it('maps is-less to < start-of-day (the day is the exclusive ceiling)', () => {
    const { startIso } = expectedBounds('2026-06-01')
    const bounds = resolveSingleDateFilterBounds({ date: '2026-06-01', op: 'is-less' })
    expect(bounds.after).toBeUndefined()
    expect(bounds.before).toBe(startIso)
  })

  it('maps is-or-less to <= end-of-day (the default — Ghost behaviour)', () => {
    const { endIso } = expectedBounds('2026-06-01')
    const bounds = resolveSingleDateFilterBounds({ date: '2026-06-01', op: 'is-or-less' })
    expect(bounds.after).toBeUndefined()
    expect(bounds.before).toBe(endIso)
  })

  it('maps is-greater to > end-of-day (the day is the exclusive floor)', () => {
    const { endIso } = expectedBounds('2026-06-01')
    const bounds = resolveSingleDateFilterBounds({ date: '2026-06-01', op: 'is-greater' })
    expect(bounds.after).toBe(endIso)
    expect(bounds.before).toBeUndefined()
  })

  it('maps is-or-greater to >= start-of-day', () => {
    const { startIso } = expectedBounds('2026-06-01')
    const bounds = resolveSingleDateFilterBounds({ date: '2026-06-01', op: 'is-or-greater' })
    expect(bounds.after).toBe(startIso)
    expect(bounds.before).toBeUndefined()
  })

  it('returns no bounds when the date is empty (operator-only chip)', () => {
    // Operator-first chips commit {date: '', op} — must not crash and stay a no-op until a date is typed.
    expect(resolveSingleDateFilterBounds({ date: '', op: 'is-greater' })).toEqual({
      after: undefined,
      before: undefined,
    })
    expect(resolveSingleDateFilterBounds({ date: '', op: 'is-or-less' })).toEqual({
      after: undefined,
      before: undefined,
    })
  })

  it('returns no bounds when the date is unparseable', () => {
    // `new Date('not-a-date')` is an Invalid Date whose `toISOString` throws.
    expect(resolveSingleDateFilterBounds({ date: 'not-a-date', op: 'is-less' })).toEqual({
      after: undefined,
      before: undefined,
    })
  })

  it('keeps the default operator aligned with Ghost (is-or-less)', () => {
    expect(DEFAULT_SINGLE_DATE_OPERATOR).toBe('is-or-less')
  })
})

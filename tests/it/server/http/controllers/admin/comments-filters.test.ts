import { describe, expect, it } from 'vitest'

import {
  DATE_FILTER_OPERATORS,
  DEFAULT_DATE_OPERATOR,
  DEFAULT_TEXT_OPERATOR,
  dateFilterLabel,
  isDateFilterOperator,
  isTextFilterOperator,
  parseDateFilter,
  parseTextFilter,
  resolveDateFilterBounds,
  TEXT_FILTER_OPERATORS,
  textFilterLabel,
} from '@/ui/admin/comments/useCommentsController'

describe('parseDateFilter', () => {
  it('returns null for undefined or empty input', () => {
    expect(parseDateFilter(undefined)).toBeNull()
    expect(parseDateFilter('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseDateFilter('not-json')).toBeNull()
    expect(parseDateFilter('{')).toBeNull()
  })

  it('returns null when the date or op is missing', () => {
    expect(parseDateFilter('{}')).toBeNull()
    expect(parseDateFilter(JSON.stringify({ op: 'is-less' }))).toBeNull()
    expect(parseDateFilter(JSON.stringify({ date: '2026-06-01' }))).toBeNull()
  })

  it('returns null for an unknown operator', () => {
    expect(parseDateFilter(JSON.stringify({ date: '2026-06-01', op: 'bogus' }))).toBeNull()
  })

  it('parses a well-formed {date, op} payload', () => {
    expect(parseDateFilter(JSON.stringify({ date: '2026-06-01', op: 'is-or-less' }))).toEqual({
      date: '2026-06-01',
      op: 'is-or-less',
    })
  })
})

describe('isDateFilterOperator', () => {
  it('accepts the four Ghost operators', () => {
    for (const op of DATE_FILTER_OPERATORS) {
      expect(isDateFilterOperator(op.value)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isDateFilterOperator('is')).toBe(false)
    expect(isDateFilterOperator(null)).toBe(false)
    expect(isDateFilterOperator(undefined)).toBe(false)
    expect(isDateFilterOperator(42)).toBe(false)
  })
})

describe('dateFilterLabel', () => {
  it('renders `<operator-label> <date>` for the four operators', () => {
    expect(dateFilterLabel({ date: '2026-06-01', op: 'is-less' })).toBe('之前 2026-06-01')
    expect(dateFilterLabel({ date: '2026-06-01', op: 'is-or-less' })).toBe('不晚于 2026-06-01')
    expect(dateFilterLabel({ date: '2026-06-01', op: 'is-greater' })).toBe('之后 2026-06-01')
    expect(dateFilterLabel({ date: '2026-06-01', op: 'is-or-greater' })).toBe('不早于 2026-06-01')
  })
})

describe('resolveDateFilterBounds', () => {
  // The bounds are built in the runner's local timezone (matching
  // what the picker does), so we mirror the SUT's construction here
  // instead of hard-coding UTC offsets — otherwise the test would
  // only pass in UTC.
  function expectedBounds(date: string) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  it('returns no bounds for a null filter', () => {
    expect(resolveDateFilterBounds(null)).toEqual({ after: undefined, before: undefined })
  })

  it('maps is-less to < start-of-day (the day is the exclusive ceiling)', () => {
    const { startIso } = expectedBounds('2026-06-01')
    const bounds = resolveDateFilterBounds({ date: '2026-06-01', op: 'is-less' })
    expect(bounds.after).toBeUndefined()
    expect(bounds.before).toBe(startIso)
  })

  it('maps is-or-less to <= end-of-day (the default — Ghost behaviour)', () => {
    const { endIso } = expectedBounds('2026-06-01')
    const bounds = resolveDateFilterBounds({ date: '2026-06-01', op: 'is-or-less' })
    expect(bounds.after).toBeUndefined()
    expect(bounds.before).toBe(endIso)
  })

  it('maps is-greater to > end-of-day (the day is the exclusive floor)', () => {
    const { endIso } = expectedBounds('2026-06-01')
    const bounds = resolveDateFilterBounds({ date: '2026-06-01', op: 'is-greater' })
    expect(bounds.after).toBe(endIso)
    expect(bounds.before).toBeUndefined()
  })

  it('maps is-or-greater to >= start-of-day', () => {
    const { startIso } = expectedBounds('2026-06-01')
    const bounds = resolveDateFilterBounds({ date: '2026-06-01', op: 'is-or-greater' })
    expect(bounds.after).toBe(startIso)
    expect(bounds.before).toBeUndefined()
  })

  it('returns no bounds when the date is empty (operator-only chip)', () => {
    // A freshly added date chip is operator-first — the user picks
    // the operator before typing a date, so the editor may commit
    // `{ date: '', op }`. The bounds resolver must not crash on
    // `new Date('').toISOString()` and must return undefined bounds
    // so the server-side filter is a no-op until the user types a
    // date.
    expect(resolveDateFilterBounds({ date: '', op: 'is-greater' })).toEqual({
      after: undefined,
      before: undefined,
    })
    expect(resolveDateFilterBounds({ date: '', op: 'is-or-less' })).toEqual({
      after: undefined,
      before: undefined,
    })
  })

  it('returns no bounds when the date is unparseable', () => {
    // Defensive against `new Date('not-a-date')` returning an
    // `Invalid Date` whose `toISOString` would throw.
    expect(resolveDateFilterBounds({ date: 'not-a-date', op: 'is-less' })).toEqual({
      after: undefined,
      before: undefined,
    })
  })

  it('keeps the default operator aligned with Ghost (is-or-less)', () => {
    expect(DEFAULT_DATE_OPERATOR).toBe('is-or-less')
  })
})

describe('parseTextFilter', () => {
  it('returns null for undefined or empty input', () => {
    expect(parseTextFilter(undefined)).toBeNull()
    expect(parseTextFilter('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseTextFilter('not-json')).toBeNull()
    expect(parseTextFilter('{')).toBeNull()
  })

  it('returns null when the op or value is missing / wrong type', () => {
    expect(parseTextFilter('{}')).toBeNull()
    expect(parseTextFilter(JSON.stringify({ op: 'contains' }))).toBeNull()
    expect(parseTextFilter(JSON.stringify({ value: 'foo' }))).toBeNull()
    expect(parseTextFilter(JSON.stringify({ op: 'contains', value: 42 }))).toBeNull()
  })

  it('returns null for an unknown operator', () => {
    expect(parseTextFilter(JSON.stringify({ op: 'equals', value: 'foo' }))).toBeNull()
  })

  it('parses a well-formed {op, value} payload', () => {
    expect(parseTextFilter(JSON.stringify({ op: 'contains', value: 'foo' }))).toEqual({
      op: 'contains',
      value: 'foo',
    })
    expect(parseTextFilter(JSON.stringify({ op: 'does-not-contain', value: 'bar' }))).toEqual({
      op: 'does-not-contain',
      value: 'bar',
    })
  })

  it('parses an empty value as a valid chip state', () => {
    // A freshly added chip with the default operator and no text is a
    // legal filter state — `parseTextFilter` must round-trip it
    // instead of dropping it.
    expect(parseTextFilter(JSON.stringify({ op: 'contains', value: '' }))).toEqual({
      op: 'contains',
      value: '',
    })
  })
})

describe('isTextFilterOperator', () => {
  it('accepts the two Ghost operators', () => {
    for (const op of TEXT_FILTER_OPERATORS) {
      expect(isTextFilterOperator(op.value)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isTextFilterOperator('contains-not')).toBe(false)
    expect(isTextFilterOperator(null)).toBe(false)
    expect(isTextFilterOperator(undefined)).toBe(false)
    expect(isTextFilterOperator(42)).toBe(false)
  })

  it('keeps the default operator aligned with Ghost (contains)', () => {
    expect(DEFAULT_TEXT_OPERATOR).toBe('contains')
  })
})

describe('textFilterLabel', () => {
  it('renders `<operator-label>「<excerpt>」` for non-empty values', () => {
    expect(textFilterLabel({ op: 'contains', value: 'foo' })).toBe('包含「foo」')
    expect(textFilterLabel({ op: 'does-not-contain', value: 'bar' })).toBe('不包含「bar」')
  })

  it('truncates long values to 8 characters with an ellipsis', () => {
    expect(textFilterLabel({ op: 'contains', value: 'abcdefghij' })).toBe('包含「abcdefgh…」')
  })

  it('drops the excerpt entirely when the value is blank', () => {
    expect(textFilterLabel({ op: 'contains', value: '' })).toBe('包含')
    expect(textFilterLabel({ op: 'contains', value: '   ' })).toBe('包含')
  })
})

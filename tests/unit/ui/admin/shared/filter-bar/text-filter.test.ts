import { describe, expect, it } from 'vitest'

import { parseTextFilterValue, textFilterValueLabel } from '@/ui/admin/shared/filter-bar/text-filter'

const OPERATORS = [
  { value: 'contains', label: '包含' },
  { value: 'does-not-contain', label: '不包含' },
] as const

describe('parseTextFilterValue', () => {
  it('returns null for undefined or empty input', () => {
    expect(parseTextFilterValue(undefined, OPERATORS)).toBeNull()
    expect(parseTextFilterValue('', OPERATORS)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseTextFilterValue('not-json', OPERATORS)).toBeNull()
    expect(parseTextFilterValue('{', OPERATORS)).toBeNull()
    expect(parseTextFilterValue('[1,2]', OPERATORS)).toBeNull()
  })

  it('returns null when the op or value is missing / wrong type', () => {
    expect(parseTextFilterValue('{}', OPERATORS)).toBeNull()
    expect(parseTextFilterValue(JSON.stringify({ op: 'contains' }), OPERATORS)).toBeNull()
    expect(parseTextFilterValue(JSON.stringify({ value: 'foo' }), OPERATORS)).toBeNull()
    expect(parseTextFilterValue(JSON.stringify({ op: 'contains', value: 42 }), OPERATORS)).toBeNull()
  })

  it('returns null for an operator outside the field’s vocabulary', () => {
    expect(parseTextFilterValue(JSON.stringify({ op: 'equals', value: 'foo' }), OPERATORS)).toBeNull()
    expect(parseTextFilterValue(JSON.stringify({ op: 'does-not-contain', value: 'foo' }), [OPERATORS[0]])).toBeNull()
  })

  it('parses a well-formed {op, value} payload', () => {
    expect(parseTextFilterValue(JSON.stringify({ op: 'contains', value: 'foo' }), OPERATORS)).toEqual({
      op: 'contains',
      value: 'foo',
    })
  })

  it('parses an empty value as a valid chip state', () => {
    // A freshly added chip with the default operator and no text is a legal
    // filter state — the parser must round-trip it instead of dropping it.
    expect(parseTextFilterValue(JSON.stringify({ op: 'contains', value: '' }), OPERATORS)).toEqual({
      op: 'contains',
      value: '',
    })
  })
})

describe('textFilterValueLabel', () => {
  it('renders `<operator-label>「<excerpt>」` for non-empty values', () => {
    expect(textFilterValueLabel({ op: 'contains', value: 'foo' }, OPERATORS)).toBe('包含「foo」')
    expect(textFilterValueLabel({ op: 'does-not-contain', value: 'bar' }, OPERATORS)).toBe('不包含「bar」')
  })

  it('truncates long values to 8 characters with an ellipsis', () => {
    expect(textFilterValueLabel({ op: 'contains', value: 'abcdefghij' }, OPERATORS)).toBe('包含「abcdefgh…」')
  })

  it('drops the excerpt entirely when the value is blank', () => {
    expect(textFilterValueLabel({ op: 'contains', value: '' }, OPERATORS)).toBe('包含')
    expect(textFilterValueLabel({ op: 'contains', value: '   ' }, OPERATORS)).toBe('包含')
  })
})

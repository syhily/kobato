import { describe, expect, it } from 'vitest'

import { csvCell } from '@/server/domains/analytics/services/export'

describe('csvCell', () => {
  it('passes plain values through untouched', () => {
    expect(csvCell('/hello')).toBe('/hello')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes cells carrying commas, quotes, or newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })

  it.each(['=SUM(A1)', '+1+1', '-2-2', '@mention', '\t=cmd', ' =1+1', '  -2'])(
    'prefixes the formula-triggering cell %s with an apostrophe',
    (value) => {
      expect(csvCell(value)).toBe(`'${value}`)
    },
  )

  it('prefixes AND quotes a formula cell with a leading carriage return', () => {
    expect(csvCell('\r=cmd')).toBe(`"'\r=cmd"`)
  })

  it('does not treat a formula character mid-string as a trigger', () => {
    expect(csvCell('/a=b')).toBe('/a=b')
  })
})

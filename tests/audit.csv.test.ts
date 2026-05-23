import { describe, expect, it } from 'vitest'

import { csvEscape, csvEscapeDisplay } from '@/server/domains/audit/csv'

describe('audit/csv', () => {
  it('returns \\N for null and undefined', () => {
    expect(csvEscape(null)).toBe('\\N')
    expect(csvEscape(undefined)).toBe('\\N')
  })

  it('returns plain string for safe values', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape(42)).toBe('42')
  })

  it('wraps values containing commas in quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('wraps values containing quotes and doubles them', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""')
  })

  it('wraps values containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"')
  })

  it('prefixes formula-risk cells with a tab', () => {
    expect(csvEscapeDisplay('=CMD')).toBe('\t=CMD')
    expect(csvEscapeDisplay('+1+1')).toBe('\t+1+1')
    expect(csvEscapeDisplay('-1+1')).toBe('\t-1+1')
    expect(csvEscapeDisplay('@SUM(A1)')).toBe('\t@SUM(A1)')
  })

  it('does not prefix safe cells that happen to contain formula chars mid-string', () => {
    expect(csvEscapeDisplay('a=b')).toBe('a=b')
    expect(csvEscapeDisplay('1+1=2')).toBe('1+1=2')
  })
})

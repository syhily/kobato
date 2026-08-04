import { csvEscapeDisplay } from '@kobato/server/domains/audit/export-csv'
import { describe, expect, it } from 'vitest'

describe('csvEscapeDisplay', () => {
  it('returns empty string for null', () => {
    expect(csvEscapeDisplay(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(csvEscapeDisplay(undefined)).toBe('')
  })

  it('stringifies numbers', () => {
    expect(csvEscapeDisplay(42)).toBe('42')
  })

  it('prefixes formula-starting values with tab', () => {
    expect(csvEscapeDisplay('=SUM(A1:A2)')).toBe('\t=SUM(A1:A2)')
    expect(csvEscapeDisplay('+1')).toBe('\t+1')
    expect(csvEscapeDisplay('-1')).toBe('\t-1')
    expect(csvEscapeDisplay('@ref')).toBe('\t@ref')
  })

  it('does not prefix safe values', () => {
    expect(csvEscapeDisplay('login')).toBe('login')
    expect(csvEscapeDisplay('1')).toBe('1')
  })

  it('wraps values containing commas in double quotes', () => {
    expect(csvEscapeDisplay('a,b')).toBe('"a,b"')
  })

  it('wraps values containing quotes and escapes them', () => {
    expect(csvEscapeDisplay('say "hello"')).toBe('"say ""hello"""')
  })

  it('wraps values containing newlines', () => {
    expect(csvEscapeDisplay('line1\nline2')).toBe('"line1\nline2"')
  })

  it('applies both formula prefix and quoting when needed', () => {
    expect(csvEscapeDisplay('=a,b')).toBe('"\t=a,b"')
  })
})

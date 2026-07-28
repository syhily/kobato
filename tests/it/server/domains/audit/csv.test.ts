import { describe, expect, it } from 'vitest'

import { csvEscapeDisplay } from '@/server/domains/audit/export-csv'

describe('audit/csv', () => {
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

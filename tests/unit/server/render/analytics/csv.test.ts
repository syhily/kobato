import { describe, expect, it } from 'vitest'

import { toCsv } from '@/server/render/analytics/csv'

describe('toCsv', () => {
  it('renders a plain happy-path row', () => {
    const result = toCsv(['name', 'visits', 'visitors'], [['hello', 10, 5]])
    expect(result).toBe('name,visits,visitors\nhello,10,5\n')
  })

  it('quotes fields containing commas', () => {
    const result = toCsv(['name', 'visits'], [['hello, world', 10]])
    expect(result).toBe('name,visits\n"hello, world",10\n')
  })

  it('quotes fields containing double quotes and doubles them', () => {
    const result = toCsv(['name', 'visits'], [['say "hello"', 10]])
    expect(result).toBe('name,visits\n"say ""hello""",10\n')
  })

  it('quotes fields containing newlines', () => {
    const result = toCsv(['name', 'visits'], [['hello\nworld', 10]])
    expect(result).toBe('name,visits\n"hello\nworld",10\n')
  })

  it('defuses formula-injection with =cmd', () => {
    const result = toCsv(['name', 'visits'], [['=cmd', 10]])
    expect(result).toBe("name,visits\n'=cmd,10\n")
  })

  it('defuses formula-injection with +1', () => {
    const result = toCsv(['name', 'visits'], [['+1', 10]])
    expect(result).toBe("name,visits\n'+1,10\n")
  })

  it('defuses formula-injection with -1', () => {
    const result = toCsv(['name', 'visits'], [['-1', 10]])
    expect(result).toBe("name,visits\n'-1,10\n")
  })

  it('defuses formula-injection with @x', () => {
    const result = toCsv(['name', 'visits'], [['@x', 10]])
    expect(result).toBe("name,visits\n'@x,10\n")
  })

  it('does not defuse plain text without trigger chars', () => {
    const result = toCsv(['name', 'visits'], [['normal', 10]])
    expect(result).toBe('name,visits\nnormal,10\n')
  })
})

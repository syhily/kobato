import { isNumeric, readStringArray, safeBigInt } from '@kobato/server/infra/coerce'
import { describe, expect, it } from 'vitest'

describe('server/infra/coerce — safeBigInt', () => {
  it('returns a number for integer strings', () => {
    expect(safeBigInt('123')).toBe(123)
    expect(safeBigInt('-45')).toBe(-45)
  })

  it('returns null for non-numeric input', () => {
    expect(safeBigInt('abc')).toBeNull()
    expect(safeBigInt('12.5')).toBeNull()
  })
})

describe('server/infra/coerce — isNumeric', () => {
  it('accepts integer strings, optionally signed', () => {
    expect(isNumeric('0')).toBe(true)
    expect(isNumeric('12345')).toBe(true)
    expect(isNumeric('-1')).toBe(true)
  })

  it('rejects decimal and non-numeric strings', () => {
    expect(isNumeric('1.5')).toBe(false)
    expect(isNumeric('abc')).toBe(false)
    expect(isNumeric('')).toBe(false)
  })
})

describe('server/infra/coerce — readStringArray', () => {
  it('returns [] for non-array input', () => {
    expect(readStringArray(undefined)).toEqual([])
    expect(readStringArray(null)).toEqual([])
    expect(readStringArray('foo')).toEqual([])
  })

  it('keeps only string items', () => {
    expect(readStringArray(['a', 1, true, null, 'b'])).toEqual(['a', 'b'])
  })
})

import { describe, expect, it } from 'vitest'

import { idStr, isNumeric, readStringArray, safeBigInt, sampleSize, shuffle } from '@/shared/utils/tools'

describe('shared/utils/tools — safeBigInt', () => {
  it('returns BigInt for numeric strings', () => {
    expect(safeBigInt('123')).toBe(123)
    expect(safeBigInt('-45')).toBe(-45)
  })

  it('returns null for non-numeric input', () => {
    expect(safeBigInt('abc')).toBeNull()
    expect(safeBigInt('12.5')).toBeNull()
  })
})

describe('shared/utils/tools — isNumeric', () => {
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

describe('shared/utils/tools — readStringArray', () => {
  it('returns [] for non-array input', () => {
    expect(readStringArray(undefined)).toEqual([])
    expect(readStringArray(null)).toEqual([])
    expect(readStringArray('foo')).toEqual([])
  })

  it('keeps only string items', () => {
    expect(readStringArray(['a', 1, true, null, 'b'])).toEqual(['a', 'b'])
  })
})

describe('shared/utils/tools — idStr', () => {
  it('stringifies bigint, number, and string ids', () => {
    expect(idStr(42)).toBe('42')
    expect(idStr(42)).toBe('42')
    expect(idStr('42')).toBe('42')
  })
})

describe('shared/utils/tools — shuffle', () => {
  it('returns a new array with the same multiset', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input, 'seed-1')
    expect(out.slice().sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('is deterministic when given the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(input, 'abc')).toEqual(shuffle(input, 'abc'))
  })

  it('returns an empty array for empty input', () => {
    expect(shuffle([], 'x')).toEqual([])
  })
})

describe('shared/utils/tools — sampleSize', () => {
  it('returns [] when n is <= 0 or input is empty', () => {
    expect(sampleSize([1, 2, 3], 0)).toEqual([])
    expect(sampleSize([1, 2, 3], -1)).toEqual([])
    expect(sampleSize([], 3)).toEqual([])
  })

  it('returns a shuffled copy when n >= input length', () => {
    const input = [1, 2, 3]
    const out = sampleSize(input, 5, 's')
    expect(out.slice().sort((a, b) => a - b)).toEqual(input)
  })

  it('returns exactly n distinct items', () => {
    const input = [1, 2, 3, 4, 5, 6, 7]
    const out = sampleSize(input, 3, 's')
    expect(out).toHaveLength(3)
    expect(new Set(out).size).toBe(3)
    for (const item of out) {
      expect(input).toContain(item)
    }
  })
})

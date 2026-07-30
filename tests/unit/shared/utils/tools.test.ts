import { describe, expect, it } from 'vitest'

import {
  deepClone,
  deepFreeze,
  groupBy,
  idStr,
  isNumeric,
  readStringArray,
  safeBigInt,
  sampleSize,
  shuffle,
} from '@/shared/utils/tools'

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

describe('shared/utils/tools — groupBy', () => {
  it('groups items by the computed key', () => {
    const out = groupBy([1, 2, 3, 4, 5, 6], (n) => (n % 2 === 0 ? 'even' : 'odd'))
    expect(out.even).toEqual([2, 4, 6])
    expect(out.odd).toEqual([1, 3, 5])
  })

  it('returns an empty record for empty input', () => {
    expect(groupBy([] as number[], (n) => String(n))).toEqual({})
  })
})

describe('shared/utils/tools — deepClone', () => {
  it('returns primitives and null unchanged', () => {
    expect(deepClone(0)).toBe(0)
    expect(deepClone('x')).toBe('x')
    expect(deepClone(null)).toBe(null)
  })

  it('clones arrays element-by-element', () => {
    const input = [{ a: 1 }, { b: [{ c: 2 }] }]
    const out = deepClone(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
    expect(out[1].b).not.toBe(input[1].b)
  })

  it('clones nested objects', () => {
    const input = { a: { b: { c: 1 } } }
    const out = deepClone(input)
    expect(out).toEqual(input)
    expect(out.a).not.toBe(input.a)
    expect(out.a.b).not.toBe(input.a.b)
  })
})

describe('shared/utils/tools — deepFreeze', () => {
  it('returns primitives unchanged', () => {
    expect(deepFreeze(0)).toBe(0)
    expect(deepFreeze(null)).toBe(null)
  })

  it('freezes nested objects and arrays', () => {
    const obj = { a: { b: 1 }, arr: [{ x: 1 }] }
    deepFreeze(obj)
    expect(Object.isFrozen(obj)).toBe(true)
    expect(Object.isFrozen(obj.a)).toBe(true)
    expect(Object.isFrozen(obj.arr)).toBe(true)
    expect(Object.isFrozen(obj.arr[0])).toBe(true)
  })

  it('is a no-op for already-frozen objects', () => {
    const obj = Object.freeze({ a: 1 })
    expect(deepFreeze(obj)).toBe(obj)
  })
})

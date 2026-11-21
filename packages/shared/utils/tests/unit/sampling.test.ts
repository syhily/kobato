import { sampleSize, shuffle } from '@kobato/utils/sampling'
import { describe, expect, it } from 'vitest'

describe('utils/sampling — shuffle', () => {
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

describe('utils/sampling — sampleSize', () => {
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

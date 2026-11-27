import { fitLinear, median, spread, sum } from '@kobato/font-split/scripts/bench/stats'
import { describe, expect, it } from 'vitest'

const PLANE = [2, 3, 0.8]
const at = (x: number[]): number => x[0]! * PLANE[0]! + x[1]! * PLANE[1]! + x[2]! * PLANE[2]!

describe('bench stats', () => {
  it('takes the median of odd and even samples', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(() => median([])).toThrow(/empty/)
    expect(sum([1, 2, 3])).toBe(6)
    expect(spread([100, 110, 120])).toBeCloseTo(2 / 11)
    expect(spread([0, 0])).toBe(0)
    expect(() => spread([])).toThrow(/empty/)
  })

  it('fits a plane through exact observations', () => {
    const points = [
      [1, 2, 3],
      [1, 4, 1],
      [1, 1, 5],
      [1, 0, 0],
      [1, 3, 2],
    ]
    const fit = fitLinear(points.map((x) => ({ x, y: at(x) })))
    expect(fit.coefficients).toHaveLength(3)
    fit.coefficients.forEach((coefficient, index) => expect(coefficient).toBeCloseTo(PLANE[index]!, 9))
    expect(fit.r2).toBeCloseTo(1, 12)
  })

  it('reports the share of variance left unexplained', () => {
    const fit = fitLinear([
      { x: [1, 0], y: 0 },
      { x: [1, 1], y: 1 },
      { x: [1, 2], y: 0 },
      { x: [1, 3], y: 3 },
    ])
    expect(fit.coefficients[1]).toBeCloseTo(0.8, 12)
    expect(fit.coefficients[0]).toBeCloseTo(-0.2, 12)
    expect(fit.r2).toBeCloseTo(1 - 2.8 / 6, 12)
    expect(() => fitLinear([])).toThrow(/empty/)
    expect(() =>
      fitLinear([
        { x: [1], y: 1 },
        { x: [1, 2], y: 2 },
      ]),
    ).toThrow(/equally sized/)
  })
})

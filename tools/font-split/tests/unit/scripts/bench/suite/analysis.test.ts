import type { LoadingTimeResult } from '@kobato/font-split/scripts/bench/suite/types'

import {
  conditionKey,
  loadingFits,
  loadingTable,
  shippedPoint,
  staircase,
} from '@kobato/font-split/scripts/bench/suite/analysis'
import { LOADING_CONDITIONS } from '@kobato/font-split/scripts/bench/suite/profile'
import { syntheticResults } from '@kobato/font-split/tests/unit/scripts/bench/results-fixture'
import { describe, expect, it } from 'vitest'

function loading(
  runs: (
    lambdaKb: number,
    pair: number,
    at: number,
  ) => { cold: number; coldFaces: number; coldBytes: number; next: number },
): LoadingTimeResult {
  const lambdasKb = [30, 45, 55]
  return {
    browser: 'test',
    lambdasKb,
    links: {
      slow: { downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 93_750, latencyMs: 150 },
      fast: { downloadBytesPerSecond: 2_500_000, uploadBytesPerSecond: 1_250_000, latencyMs: 40 },
    },
    pairsPerLink: { slow: 2, fast: 2 },
    conditions: LOADING_CONDITIONS.map((condition) => ({
      ...condition,
      pairs: [0, 1].map((pair) => ({
        index: pair,
        coldPage: pair,
        nextPage: pair + 1,
        runs: Object.fromEntries(
          lambdasKb.map((lambdaKb, at) => {
            const run = runs(lambdaKb, pair, at)
            return [
              String(lambdaKb),
              {
                coldMs: run.cold,
                coldFaces: run.coldFaces,
                coldBytes: run.coldBytes,
                nextMs: run.next,
                nextNewFaces: 30,
                nextNewBytes: lambdaKb * 1000,
                nextCachedFaces: 20,
              },
            ]
          }),
        ),
      })),
    })),
  }
}

describe('font-split benchmark analysis', () => {
  it('keys the loading conditions and names the shipped sweep point', () => {
    expect(conditionKey('h2', 'fast')).toBe('h2-fast')
    expect(shippedPoint(syntheticResults().pageCost.sweep.calendar!).lambdaKb).toBe(55)
    expect(() => shippedPoint([{ lambdaKb: 30, muKb: 0.5, corpora: syntheticResults().pageCost.fixture }])).toThrow(
      /no λ=55 KB point/,
    )
  })

  it('takes the median of the paired ratios relative to the first λ', () => {
    const table = loadingTable(
      loading((lambdaKb, pair) => ({
        cold: 100 * (lambdaKb / 30) ** (pair + 1),
        coldFaces: 60,
        coldBytes: 60_000,
        next: 400 - lambdaKb,
      })),
    )
    expect(table['h1-slow']!.pairs).toBe(2)
    expect(table['h1-slow']!.cold['45']).toBeCloseTo((1.5 + 2.25) / 2, 12)
    expect(table['h1-slow']!.cold['55']).toBeCloseTo((55 / 30 + (55 / 30) ** 2) / 2, 12)
    expect(table['h2-fast']!.next['55']).toBeCloseTo(345 / 370, 12)
    expect(Object.keys(table)).toEqual(['h1-slow', 'h1-fast', 'h2-slow', 'h2-fast'])
  })

  it('prices bytes and requests per link and protocol from the runs', () => {
    const fits = loadingFits(
      loading((lambdaKb, pair, at) => {
        const coldFaces = 40 + pair * 9 + at
        const coldBytes = lambdaKb * 2000 + pair * 5000
        return {
          cold: 100 + coldBytes / 400 + coldFaces * 7,
          coldFaces,
          coldBytes,
          next: 50 + (lambdaKb * 1000) / 400 + 210,
        }
      }),
      syntheticResults().pageCost.fixture.blog,
    )
    for (const condition of LOADING_CONDITIONS) {
      const fit = fits[conditionKey(condition.protocol, condition.link)]!
      expect(fit.observations).toBe(12)
      expect(fit.msPerKb).toBeCloseTo(1024 / 400, 9)
      expect(fit.msPerRequest).toBeCloseTo(7, 9)
      expect(fit.r2).toBeCloseTo(1, 9)
      expect(fit.coldRequestShare).toBeGreaterThan(0)
      expect(fit.coldRequestShare).toBeLessThan(1)
    }
  })

  it('prices each request saved between neighbouring λ points', () => {
    const steps = staircase(syntheticResults().pageCost.sweep.calendar!)
    expect(steps.map((step) => step.lambdaKb)).toEqual([25, 30, 37.5, 45, 55, 60, 80, 120])
    for (const step of steps) {
      expect(step.kbPerRequest).toBeCloseTo(4000 / 1024 / 0.36, 6)
    }
    expect(staircase([])).toEqual([])
  })
})

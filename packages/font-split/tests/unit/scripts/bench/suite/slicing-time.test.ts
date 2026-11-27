import { assertSteady } from '@kobato/font-split/scripts/bench/suite/slicing-time'
import { describe, expect, it } from 'vitest'

describe('the slicing-time samples', () => {
  it('refuse a variant whose interleaved runs spread too wide to publish', () => {
    const busy = [12_520, 12_540, 12_720, 13_620, 14_140]
    expect(() => assertSteady('shipped', busy, 'page-cost')).toThrow(
      /the shipped samples spread 13% across the interleaved runs — the machine was busy. Measure the stage again on a quiet machine with --skip page-cost$/,
    )
    expect(() => assertSteady('shipped', [11_870, 11_980, 12_080, 12_150, 12_160], 'page-cost')).not.toThrow()
  })

  it('leave the sub-second variants alone', () => {
    expect(() => assertSteady('raw', [190, 200, 230], 'page-cost')).not.toThrow()
  })
})

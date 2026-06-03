import { describe, expect, it } from 'vitest'

import { computePercentage, computePercentageOfY } from '@/ui/public/aplayer/utils/compute-percentage'

describe('ui/public/aplayer/utils/compute-percentage', () => {
  describe('computePercentage', () => {
    it('returns 0 when ref is null', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement | null>
      expect(computePercentage({ clientX: 100 }, ref)).toBe(0)
    })

    it('computes percentage from mouse x position', () => {
      const ref = {
        current: {
          getBoundingClientRect: () => ({ left: 50 }),
          clientWidth: 200,
        } as HTMLDivElement,
      } as React.RefObject<HTMLDivElement | null>

      expect(computePercentage({ clientX: 50 }, ref)).toBe(0)
      expect(computePercentage({ clientX: 150 }, ref)).toBe(0.5)
      expect(computePercentage({ clientX: 250 }, ref)).toBe(1)
    })

    it('clamps to [0, 1] and floors to 2 decimals', () => {
      const ref = {
        current: {
          getBoundingClientRect: () => ({ left: 100 }),
          clientWidth: 100,
        } as HTMLDivElement,
      } as React.RefObject<HTMLDivElement | null>

      expect(computePercentage({ clientX: 50 }, ref)).toBe(0)
      expect(computePercentage({ clientX: 250 }, ref)).toBe(1)
      expect(computePercentage({ clientX: 155 }, ref)).toBe(0.55)
    })
  })

  describe('computePercentageOfY', () => {
    it('returns 0 when ref is null', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement | null>
      expect(computePercentageOfY({ clientY: 100 }, ref)).toBe(0)
    })

    it('computes inverted percentage from mouse y position', () => {
      const ref = {
        current: {
          getBoundingClientRect: () => ({ top: 100 }),
          clientHeight: 100,
        } as HTMLDivElement,
      } as React.RefObject<HTMLDivElement | null>

      expect(computePercentageOfY({ clientY: 200 }, ref)).toBe(0)
      expect(computePercentageOfY({ clientY: 150 }, ref)).toBe(0.5)
      expect(computePercentageOfY({ clientY: 100 }, ref)).toBe(1)
    })

    it('clamps to [0, 1]', () => {
      const ref = {
        current: {
          getBoundingClientRect: () => ({ top: 100 }),
          clientHeight: 100,
        } as HTMLDivElement,
      } as React.RefObject<HTMLDivElement | null>

      expect(computePercentageOfY({ clientY: 250 }, ref)).toBe(0)
      expect(computePercentageOfY({ clientY: 50 }, ref)).toBe(1)
    })
  })
})

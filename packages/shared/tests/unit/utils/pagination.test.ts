import { computePageWindow, DENSE_THRESHOLD } from '@kobato/shared/utils/pagination'
import { describe, expect, it } from 'vitest'

// Pins the page-window algorithm shared between the public site and
// the admin shell so the rendered chip ladder is identical for any
// `(current, total)` tuple.
describe('computePageWindow', () => {
  describe('edge cases', () => {
    it('returns [] for total <= 1 (caller renders nothing)', () => {
      expect(computePageWindow({ current: 1, total: 0 })).toEqual([])
      expect(computePageWindow({ current: 1, total: 1 })).toEqual([])
    })

    it('handles total = 2 (DENSE)', () => {
      expect(computePageWindow({ current: 1, total: 2 })).toEqual([1, 2])
      expect(computePageWindow({ current: 2, total: 2 })).toEqual([1, 2])
    })

    it('keeps DENSE_THRESHOLD pinned at 6', () => {
      expect(DENSE_THRESHOLD).toBe(6)
    })
  })

  describe('dense layout (total <= DENSE_THRESHOLD)', () => {
    it('renders every page when total = 3', () => {
      expect(computePageWindow({ current: 2, total: 3 })).toEqual([1, 2, 3])
    })

    it('renders every page when total = 6 (boundary)', () => {
      expect(computePageWindow({ current: 1, total: 6 })).toEqual([1, 2, 3, 4, 5, 6])
      expect(computePageWindow({ current: 6, total: 6 })).toEqual([1, 2, 3, 4, 5, 6])
    })
  })

  describe('windowed layout (total > DENSE_THRESHOLD)', () => {
    describe('near start (current < 5)', () => {
      it('renders [1..5, ellipsis, total] for current=1', () => {
        expect(computePageWindow({ current: 1, total: 7 })).toEqual([1, 2, 3, 4, 5, 'ellipsis', 7])
        expect(computePageWindow({ current: 1, total: 10 })).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10])
      })

      it('renders [1..5, ellipsis, total] for current=4', () => {
        expect(computePageWindow({ current: 4, total: 10 })).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10])
      })
    })

    describe('near end (current > total - 4)', () => {
      it('renders [1, ellipsis, total-4..total] for current=total', () => {
        expect(computePageWindow({ current: 10, total: 10 })).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10])
      })

      it('renders [1, ellipsis, total-4..total] for current=total-3', () => {
        expect(computePageWindow({ current: 7, total: 10 })).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10])
      })
    })

    describe('middle (neither near start nor end)', () => {
      it('renders [1, ellipsis, current-1, current, current+1, ellipsis, total] for current=5/total=10', () => {
        expect(computePageWindow({ current: 5, total: 10 })).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
      })

      it('renders the same shape for current=6/total=10', () => {
        expect(computePageWindow({ current: 6, total: 10 })).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 10])
      })

      it('handles long totals (current=50/total=100)', () => {
        expect(computePageWindow({ current: 50, total: 100 })).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100])
      })
    })

    describe('boundary at total = 7 (smallest windowed total)', () => {
      it('renders nearStart layout for current=1..4', () => {
        expect(computePageWindow({ current: 1, total: 7 })).toEqual([1, 2, 3, 4, 5, 'ellipsis', 7])
        expect(computePageWindow({ current: 4, total: 7 })).toEqual([1, 2, 3, 4, 5, 'ellipsis', 7])
      })

      it('renders nearEnd layout for current=4..7', () => {
        // current=4 is also nearStart-eligible (4 < 5); nearStart wins
        // because the algorithm checks it first.
        expect(computePageWindow({ current: 5, total: 7 })).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7])
        expect(computePageWindow({ current: 7, total: 7 })).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7])
      })
    })
  })

  describe('chip count invariants', () => {
    it('always includes current as a number when result is non-empty', () => {
      for (const total of [2, 6, 7, 10, 50, 100]) {
        for (const current of [1, Math.floor(total / 2), total]) {
          const items = computePageWindow({ current, total })
          expect(items, `current=${current} total=${total}`).toContain(current)
        }
      }
    })

    it('always anchors page 1 and page total in windowed mode', () => {
      for (const total of [7, 10, 50, 100]) {
        for (const current of [1, Math.floor(total / 2), total]) {
          const items = computePageWindow({ current, total })
          expect(items[0], `current=${current} total=${total}`).toBe(1)
          expect(items[items.length - 1], `current=${current} total=${total}`).toBe(total)
        }
      }
    })

    it('emits exactly 7 chips in windowed mode (5 numbers + 2 ellipses, or 7 numbers w/ 1 ellipsis)', () => {
      expect(computePageWindow({ current: 1, total: 100 }).length).toBe(7)
      expect(computePageWindow({ current: 100, total: 100 }).length).toBe(7)
      expect(computePageWindow({ current: 50, total: 100 }).length).toBe(7)
    })
  })
})

import { useShowOnScroll } from '@kobato/ui/lib/use-show-on-scroll'
import { renderHook } from '@kobato/ui/tests/utils/hook'
import { describe, expect, it } from 'vitest'

describe('useShowOnScroll', () => {
  it('returns false before any scroll event fires in SSR', () => {
    const result = renderHook(() => useShowOnScroll())
    expect(result).toBe(false)
  })

  it('returns false with a custom threshold before scroll fires', () => {
    const result = renderHook(() => useShowOnScroll(500))
    expect(result).toBe(false)
  })
})

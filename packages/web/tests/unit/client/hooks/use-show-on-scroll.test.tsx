import { renderHook } from '@kobato/test-helpers/hook.tsx'
import { useShowOnScroll } from '@kobato/web/client/hooks/use-show-on-scroll.ts'
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

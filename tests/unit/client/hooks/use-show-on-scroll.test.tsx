import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useShowOnScroll } from '@/client/hooks/use-show-on-scroll'

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

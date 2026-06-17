import { describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'

describe('useIosNoZoomOnFocus', () => {
  it('renders without error in SSR (window undefined)', () => {
    expect(() => renderHook(() => useIosNoZoomOnFocus())).not.toThrow()
  })

  it('no-ops on non-iOS user agents when window is present', () => {
    const originalWindow = globalThis.window
    globalThis.window = { navigator: { userAgent: 'Mozilla/5.0 (Android 10)' } } as any
    try {
      expect(() => renderHook(() => useIosNoZoomOnFocus())).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('no-ops when viewport meta is missing on iOS', () => {
    const originalWindow = globalThis.window
    globalThis.window = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)' } } as any
    try {
      expect(() => renderHook(() => useIosNoZoomOnFocus())).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { GifProviderConfig } from '@/utils/services/gif'
import type { GifScheduler } from '@/utils/services/gif-browser'

import { useGifBrowser } from '@/hooks/useGifBrowser'

// Adapter tests: the fetch/navigation behaviour lives in gif-browser.test.ts.
// This file only pins the hook's wiring — memo stability keyed on the config
// fields (callers re-resolve the config object per render) and disposal.

const CONFIG: GifProviderConfig = {
  provider: 'tenor',
  apiUrl: 'https://tenor.googleapis.com',
  apiKey: 'test-key',
  contentFilter: 'off',
}

function createManualScheduler(): GifScheduler & { pendingCount: () => number } {
  const pending: Array<{ cancelled: boolean }> = []
  return {
    schedule(fn) {
      const entry = { cancelled: false }
      pending.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    pendingCount: () => pending.filter((entry) => !entry.cancelled).length,
  }
}

describe('useGifBrowser', () => {
  it('keeps the browser stable when the config object identity changes but its fields do not', () => {
    const { result, rerender } = renderHook(({ config }) => useGifBrowser({ config }), {
      initialProps: { config: CONFIG },
    })
    const browser = result.current

    rerender({ config: { ...CONFIG } })

    expect(result.current).toBe(browser)
  })

  it('recreates the browser when a config field changes', () => {
    const { result, rerender } = renderHook(({ config }) => useGifBrowser({ config }), {
      initialProps: { config: CONFIG },
    })
    const browser = result.current

    rerender({ config: { ...CONFIG, apiKey: 'other-key' } })

    expect(result.current).not.toBe(browser)
  })

  it('disposes the browser on unmount, cancelling the pending search', () => {
    const scheduler = createManualScheduler()
    const { result, unmount } = renderHook(() => useGifBrowser({ config: CONFIG, scheduler }))

    result.current.dispatch({ type: 'search', term: 'cats' })
    expect(scheduler.pendingCount()).toBe(1)

    unmount()
    expect(scheduler.pendingCount()).toBe(0)
  })
})

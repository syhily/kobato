// @vitest-environment happy-dom

import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NavigationSplash } from '@/ui/public/chrome/NavigationSplash'

// While the veil is up, NavigationSplash flags <body data-nav-splash> so the
// shared CSS guard can strip view-transition-name from every element — named
// captures (post-title flights) would otherwise paint in the
// ::view-transition overlay ABOVE the opaque veil. Fast navigations never
// reach the threshold, so the flag (and the flights) stay untouched.

const navigationState = vi.hoisted(() => ({ state: 'idle' }))
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigation: () => navigationState }
})

function setNavigationState(state: string) {
  navigationState.state = state
}

describe('ui/public/chrome/NavigationSplash — view-transition guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigationState.state = 'idle'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.removeAttribute('data-nav-splash')
  })

  it('never flags the document on a fast navigation (below the threshold)', () => {
    const view = render(<NavigationSplash />)

    act(() => {
      setNavigationState('loading')
      view.rerender(<NavigationSplash />)
    })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(false)

    act(() => {
      setNavigationState('idle')
      view.rerender(<NavigationSplash />)
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(false)
  })

  it('flags the document once the veil shows and unflags it after the fade', () => {
    const view = render(<NavigationSplash />)

    act(() => {
      setNavigationState('loading')
      view.rerender(<NavigationSplash />)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(true)

    act(() => {
      setNavigationState('idle')
      view.rerender(<NavigationSplash />)
    })
    // Still flagged through the minimum-visible hold and the fade-out.
    act(() => {
      vi.advanceTimersByTime(300 + 250 - 1)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(false)
  })

  it('unflags the document on unmount even mid-veil', () => {
    const view = render(<NavigationSplash />)

    act(() => {
      setNavigationState('loading')
      view.rerender(<NavigationSplash />)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(document.body.hasAttribute('data-nav-splash')).toBe(true)

    view.unmount()
    expect(document.body.hasAttribute('data-nav-splash')).toBe(false)
  })
})

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRumConsent } from '@/client/hooks/use-rum-consent'

const STORAGE_KEY = 'kobato.rum.consent'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useRumConsent', () => {
  it('reads the persisted decision only after mount (SSR stays undecided)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'accepted')

    const { result } = renderHook(() => useRumConsent())

    expect(result.current.ready).toBe(true)
    expect(result.current.decision).toBe('accepted')
  })

  it('starts undecided and settles on accept / decline', () => {
    const { result } = renderHook(() => useRumConsent())
    expect(result.current.ready).toBe(true)
    expect(result.current.decision).toBeNull()

    act(() => result.current.accept())
    expect(result.current.decision).toBe('accepted')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('accepted')

    act(() => result.current.decline())
    expect(result.current.decision).toBe('declined')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('declined')
  })

  it('follows a cross-tab storage event', () => {
    const { result } = renderHook(() => useRumConsent())
    expect(result.current.decision).toBeNull()

    act(() => {
      window.localStorage.setItem(STORAGE_KEY, 'declined')
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'declined' }))
    })

    expect(result.current.decision).toBe('declined')
  })
})

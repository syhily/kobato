// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCommentGuest, type CommentGuestProfile } from '@/client/hooks/use-comment-guest'

// Client-side behavior of the SSR-consistent prefill: the server snapshot
// is empty, so SSR and the hydration render agree; the client snapshot
// reads localStorage and React re-renders with it after hydration.
// happy-dom doesn't implement localStorage, so stub the bare global the
// hook reads (same pattern as like-actions-validate-race.test.tsx).
const STORAGE_KEY = 'comment-guest-profile'

const VALID_PROFILE: CommentGuestProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  link: 'https://alice.example',
  avatar: 'https://avatar.example/a.png',
}

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem(key: string) {
    return store.get(key) ?? null
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
  removeItem(key: string) {
    store.delete(key)
  },
  clear() {
    store.clear()
  },
} as unknown as Storage)

function Probe() {
  const { profile } = useCommentGuest()
  return <span>{profile ? profile.name : 'empty'}</span>
}

beforeEach(() => {
  store.clear()
})

describe('useCommentGuest client behavior', () => {
  it('hard load: SSR emits the empty state, hydration does not mismatch, and the profile lands afterwards', async () => {
    store.set(STORAGE_KEY, JSON.stringify(VALID_PROFILE))
    const container = document.createElement('div')
    document.body.appendChild(container)

    // The server render sees the server snapshot — always empty.
    container.innerHTML = renderToStaticMarkup(<Probe />)
    expect(container.textContent).toBe('empty')

    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args))
    await act(async () => {
      hydrateRoot(container, <Probe />)
    })
    spy.mockRestore()

    // No hydration warning/error, and the stored profile is prefilled
    // once React swaps to the client snapshot.
    expect(errors).toEqual([])
    expect(container.textContent).toBe('Alice')
    container.remove()
  })

  it('prefills immediately on SPA navigation (client-side mount)', () => {
    store.set(STORAGE_KEY, JSON.stringify(VALID_PROFILE))
    const { result } = renderHook(() => useCommentGuest())
    expect(result.current.profile).toEqual(VALID_PROFILE)
  })

  it('stays null when nothing is stored', () => {
    const { result } = renderHook(() => useCommentGuest())
    expect(result.current.profile).toBeNull()
  })

  it('saveProfile / clearProfile update the subscribed snapshot', () => {
    const { result } = renderHook(() => useCommentGuest())
    expect(result.current.profile).toBeNull()

    act(() => result.current.saveProfile(VALID_PROFILE))
    expect(result.current.profile).toEqual(VALID_PROFILE)

    act(() => result.current.clearProfile())
    expect(result.current.profile).toBeNull()
  })
})

// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCommentGuest, type CommentGuestProfile } from '@/client/hooks/use-comment-guest'

// Client snapshot reads localStorage, so SSR and hydration agree on empty
// and React re-renders after hydration; happy-dom lacks localStorage — stub it.
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

    container.innerHTML = renderToStaticMarkup(<Probe />)
    expect(container.textContent).toBe('empty')

    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args))
    await act(async () => {
      hydrateRoot(container, <Probe />)
    })
    spy.mockRestore()

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { readProfile, useCommentGuest, type CommentGuestProfile } from '@/client/hooks/use-comment-guest'

const STORAGE_KEY = 'comment-guest-profile'

const VALID_PROFILE: CommentGuestProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  link: 'https://alice.example',
  avatar: 'https://avatar.example/a.png',
}

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => store.clear()),
    _store: store,
  }
}

type StorageLike = ReturnType<typeof makeStorage>

// Node defines no `window`; `readProfile` guards with `typeof window`,
// so each test installs a fake window + localStorage to reach its storage paths.
interface FakeWindow {
  localStorage: StorageLike
}

let savedDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  savedDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
})

afterEach(() => {
  if (savedDescriptor) {
    Object.defineProperty(globalThis, 'window', savedDescriptor)
  } else {
    delete (globalThis as { window?: unknown }).window
  }
  vi.restoreAllMocks()
})

function installWindow(initial: Record<string, string> = {}): FakeWindow {
  const fake: FakeWindow = { localStorage: makeStorage(initial) }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fake,
    writable: true,
  })
  return fake
}

describe('readProfile + isCommentGuestProfile', () => {
  it('returns null when localStorage has no profile entry', () => {
    const fake = installWindow()
    expect(readProfile()).toBeNull()
    expect(fake.localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when the stored JSON is malformed', () => {
    const fake = installWindow({ [STORAGE_KEY]: '{not json' })
    expect(readProfile()).toBeNull()
    expect(fake.localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when the stored value is not an object', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify('just-a-string') })
    expect(readProfile()).toBeNull()
  })

  it('returns null when name is not a string', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify({ name: 42, email: 'a@b.c' }) })
    expect(readProfile()).toBeNull()
  })

  it('returns null when email is not a string', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify({ name: 'A', email: null }) })
    expect(readProfile()).toBeNull()
  })

  it('returns null when link is present but not a string', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify({ name: 'A', email: 'a@b.c', link: 5 }) })
    expect(readProfile()).toBeNull()
  })

  it('returns null when avatar is present but not a string', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify({ name: 'A', email: 'a@b.c', avatar: false }) })
    expect(readProfile()).toBeNull()
  })

  it('returns a profile with only name + email when optional fields are absent', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify({ name: 'Bob', email: 'b@c.d' }) })
    expect(readProfile()).toEqual({ name: 'Bob', email: 'b@c.d' })
  })

  it('returns the full profile when all fields are valid', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify(VALID_PROFILE) })
    expect(readProfile()).toEqual(VALID_PROFILE)
  })

  it('returns null when window is absent (SSR)', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readProfile()).toBeNull()
  })
})

describe('useCommentGuest first render (SSR / hydration pass)', () => {
  it('renders null on the server snapshot even when a profile is stored', () => {
    installWindow({ [STORAGE_KEY]: JSON.stringify(VALID_PROFILE) })
    const result = renderHook(() => useCommentGuest())
    expect(result.profile).toBeNull()
  })
})

describe('useCommentGuest saveProfile (writeProfile)', () => {
  it('persists the profile to localStorage and updates state', () => {
    const fake = installWindow()
    const result = renderHook(() => useCommentGuest())
    result.saveProfile(VALID_PROFILE)
    expect(fake.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(VALID_PROFILE))
  })

  it('overwrites a previously stored profile', () => {
    const fake = installWindow({ [STORAGE_KEY]: JSON.stringify(VALID_PROFILE) })
    const result = renderHook(() => useCommentGuest())
    const next: CommentGuestProfile = { name: 'Zoe', email: 'z@y.x' }
    result.saveProfile(next)
    expect(JSON.parse(fake.localStorage._store.get(STORAGE_KEY)!)).toEqual(next)
  })
})

describe('useCommentGuest clearProfile (removeProfile)', () => {
  it('removes the profile from localStorage', () => {
    const fake = installWindow({ [STORAGE_KEY]: JSON.stringify(VALID_PROFILE) })
    const result = renderHook(() => useCommentGuest())
    result.clearProfile()
    // No re-render happens under the SSR runner — assert the storage side-effect.
    expect(fake.localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })
})

describe('useCommentGuest SSR guard (typeof window === undefined)', () => {
  it('returns a null profile and no-op writes when window is absent', () => {
    delete (globalThis as { window?: unknown }).window
    const result = renderHook(() => useCommentGuest())
    expect(result.profile).toBeNull()
    expect(() => result.saveProfile(VALID_PROFILE)).not.toThrow()
    expect(() => result.clearProfile()).not.toThrow()
  })
})

describe('useCommentGuest stability', () => {
  it('saveProfile / clearProfile keep referential identity across renders', () => {
    installWindow()
    const results: ReturnType<typeof useCommentGuest>[] = []
    renderHook(
      () => {
        const r = useCommentGuest()
        results.push(r)
        return r
      },
      {
        actions: [
          (r) => {
            r.saveProfile(VALID_PROFILE)
          },
        ],
      },
    )
    if (results.length >= 2) {
      expect(results[0].saveProfile).toBe(results[1].saveProfile)
      expect(results[0].clearProfile).toBe(results[1].clearProfile)
    }
  })
})

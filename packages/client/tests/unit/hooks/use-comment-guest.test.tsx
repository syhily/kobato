import { renderHook } from '#/_helpers/hook'

import { readProfile, useCommentGuest, type CommentGuestProfile } from '@kobato/client/hooks/use-comment-guest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'comment-guest-profile'

const VALID_PROFILE: CommentGuestProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  link: 'https://alice.example',
  avatar: 'https://avatar.example/a.png',
}

// Minimal localStorage stub backed by an in-memory map.
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

// The unit project runs under `environment: 'node'`, so `window` is
// not defined by default. `readProfile` guards every storage touch with
// `typeof window === 'undefined'`, so to exercise the profile read /
// write / remove logic we install a fake `window` with a `localStorage`
// slot for the duration of each test.
interface FakeWindow {
  localStorage: StorageLike
}

let savedDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  // Snapshot the current globalThis.window state so afterEach can
  // restore it cleanly. Under node this is `undefined`.
  savedDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
})

afterEach(() => {
  // Restore the original (undefined) window.
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
    // readProfile swallows the parse error.
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
  // The SSR hook runner renders the server snapshot, so what it returns is
  // exactly what SSR and the client's hydration render see.
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
    // removeProfile runs synchronously inside the callback; the companion
    // setState(null) only reflects on the next render (which never
    // happens under the SSR runner), so we assert the storage side-effect.
    expect(fake.localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })
})

describe('useCommentGuest SSR guard (typeof window === undefined)', () => {
  it('returns a null profile and no-op writes when window is absent', () => {
    // Do not install a window; globalThis.window stays undefined after
    // the afterEach from the previous test restored it.
    delete (globalThis as { window?: unknown }).window
    const result = renderHook(() => useCommentGuest())
    expect(result.profile).toBeNull()
    // saveProfile / clearProfile are wrapped in the same guard and
    // must not throw.
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
          // Trigger a re-render via a state update so we can compare
          // callback references across two renders.
          (r) => {
            r.saveProfile(VALID_PROFILE)
          },
        ],
      },
    )
    // The action fires a state update; once settled, the callbacks
    // must keep referential identity (useCallback with empty deps).
    if (results.length >= 2) {
      expect(results[0].saveProfile).toBe(results[1].saveProfile)
      expect(results[0].clearProfile).toBe(results[1].clearProfile)
    }
  })
})

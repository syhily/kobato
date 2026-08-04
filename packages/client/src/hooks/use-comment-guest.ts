import { isRecord } from '@kobato/shared/utils/type-guards'
import { useCallback, useSyncExternalStore } from 'react'

export interface CommentGuestProfile {
  name: string
  email: string
  link?: string
  avatar?: string
}

const STORAGE_KEY = 'comment-guest-profile'

function isCommentGuestProfile(value: unknown): value is CommentGuestProfile {
  if (!isRecord(value)) {
    return false
  }
  if (typeof value.name !== 'string') {
    return false
  }
  if (typeof value.email !== 'string') {
    return false
  }
  if (value.link !== undefined && typeof value.link !== 'string') {
    return false
  }
  if (value.avatar !== undefined && typeof value.avatar !== 'string') {
    return false
  }
  return true
}

/** Read the stored profile once. Exported for unit tests. */
export function readProfile(): CommentGuestProfile | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (isCommentGuestProfile(parsed)) {
      return parsed
    }
  } catch {
    // ignore malformed storage
  }
  return null
}

function writeProfile(profile: CommentGuestProfile): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function removeProfile(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(STORAGE_KEY)
}

// Snapshot cache: `useSyncExternalStore` requires `getSnapshot` to return a
// referentially stable value between store changes, so the parsed profile
// is cached against the raw storage string (same idiom as
// `use-thumbhash-bg.ts`).
let cachedRaw: string | null | undefined
let cachedProfile: CommentGuestProfile | null = null

function getSnapshot(): CommentGuestProfile | null {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedProfile = readProfile()
  }
  return cachedProfile
}

function getServerSnapshot(): CommentGuestProfile | null {
  return null
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function useCommentGuest() {
  // SSR-consistent prefill via `useSyncExternalStore`: the server snapshot
  // is always `null`, so SSR and the hydration render agree and React
  // re-renders with the stored profile right after hydration — no
  // hydration mismatch. SPA navigations mount client-side and read the
  // client snapshot on the first render, so prefill stays instant there.
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const saveProfile = useCallback((next: CommentGuestProfile) => {
    writeProfile(next)
    emitChange()
  }, [])

  const clearProfile = useCallback(() => {
    removeProfile()
    emitChange()
  }, [])

  return { profile, saveProfile, clearProfile }
}

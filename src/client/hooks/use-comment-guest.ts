import { useCallback, useSyncExternalStore } from 'react'

import { isRecord } from '@/shared/utils/type-guards'

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

// `useSyncExternalStore` needs a referentially stable snapshot — cache the
// parsed profile against the raw storage string (same idiom as use-thumbhash-bg).
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
  // SSR-consistent prefill: the server snapshot is always null so SSR and
  // hydration agree; React re-renders with the stored profile right after
  // hydration, and SPA navigations read it on first render.
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

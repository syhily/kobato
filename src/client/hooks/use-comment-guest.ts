import { useCallback, useState } from 'react'

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

function readProfile(): CommentGuestProfile | null {
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

export function useCommentGuest() {
  // Lazy initializer reads from localStorage exactly once on mount (client
  // only — guarded inside readProfile) without a render+effect cycle.
  const [profile, setProfileState] = useState<CommentGuestProfile | null>(() => readProfile())

  const saveProfile = useCallback((next: CommentGuestProfile) => {
    writeProfile(next)
    setProfileState(next)
  }, [])

  const clearProfile = useCallback(() => {
    removeProfile()
    setProfileState(null)
  }, [])

  return { profile, saveProfile, clearProfile }
}

// Writing-focus mode toggle (plan M3, 三核裁决 4): the inkling surface's
// `focusMode` prop mounts FocusModePlugin, which marks the editor root with
// `inkling-focus-mode` and the selected top-level block with
// `data-inkling-focus-active`; the dimming CSS lives in
// `styles/inkling-editor.css`.
// The toggle state is a localStorage preference (like the retired toolbar
// density — SSR-consistent via `useSyncExternalStore`: the server snapshot
// is always `false`, so SSR and hydration agree).

import { useCallback, useSyncExternalStore } from 'react'

const FOCUS_MODE_STORAGE_KEY = 'kobato/admin/page-editor/focus-mode'

// Cache the parsed snapshot: `useSyncExternalStore` demands referential
// stability between store changes.
let cachedRaw: string | null | undefined
let cachedEnabled = false

function getSnapshot(): boolean {
  let raw: string | null = null
  if (typeof window !== 'undefined') {
    try {
      raw = window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY)
    } catch {
      // localStorage may throw in private mode — treat as nothing stored.
      raw = null
    }
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedEnabled = raw === '1'
  }
  return cachedEnabled
}

function getServerSnapshot(): boolean {
  return false
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

export function useFocusModePreference(): [boolean, () => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggle = useCallback(() => {
    const next = !getSnapshot()
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage may throw (private mode / quota); the preference is best-effort.
      }
    }
    emitChange()
  }, [])
  return [enabled, toggle]
}

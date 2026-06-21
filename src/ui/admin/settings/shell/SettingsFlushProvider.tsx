import { type ReactNode, createContext, use, useCallback, useMemo, useRef } from 'react'

// Flush registry for /admin/settings.
//
// Each `useSettingsCard` registers its `flush` fn under its section id. Three
// trigger sources call back into the registry:
//   - close button / ESC                 → `flushAll`
//   - scroll-away (IntersectionObserver) → `flushSection(id)`
//   - page hide (visibilitychange/pagehide) → `flushAll`
//
// The registry itself is agnostic about *when* to flush — it only knows *what*
// to call. Dirty-checking lives inside each card's `flush`, so calling a clean
// card is a cheap no-op.
//
// Refs (not state) hold the Map so registrations don't trigger re-renders —
// only the card that registered cares about its own flush identity.

interface SettingsFlushContextValue {
  /** Register a flush fn under a section id. Returns an unregister fn. */
  registerFlush: (sectionId: string, fn: () => void) => () => void
  /** Invoke every registered flush fn. Idempotent (clean cards no-op). */
  flushAll: () => void
  /** Invoke only the flush fns registered under `sectionId`. */
  flushSection: (sectionId: string) => void
}

// Default: no-op. Keeps `useSettingsCard` safe in unit tests that don't wrap
// the provider.
const SettingsFlushContext = createContext<SettingsFlushContextValue>({
  registerFlush: () => () => {
    /* noop */
  },
  flushAll: () => {
    /* noop */
  },
  flushSection: () => {
    /* noop */
  },
})

export function SettingsFlushProvider({ children }: { children: ReactNode }) {
  const flushMapRef = useRef<Map<string, Set<() => void>>>(new Map())

  const registerFlush = useCallback((sectionId: string, fn: () => void) => {
    let set = flushMapRef.current.get(sectionId)
    if (!set) {
      set = new Set()
      flushMapRef.current.set(sectionId, set)
    }
    set.add(fn)
    return () => {
      const current = flushMapRef.current.get(sectionId)
      if (current) {
        current.delete(fn)
        if (current.size === 0) {
          flushMapRef.current.delete(sectionId)
        }
      }
    }
  }, [])

  const flushAll = useCallback(() => {
    for (const set of flushMapRef.current.values()) {
      for (const fn of set) fn()
    }
  }, [])

  const flushSection = useCallback((sectionId: string) => {
    const set = flushMapRef.current.get(sectionId)
    if (set) {
      for (const fn of set) fn()
    }
  }, [])

  const value = useMemo(
    () => ({ registerFlush, flushAll, flushSection }),
    [registerFlush, flushAll, flushSection],
  )

  return <SettingsFlushContext value={value}>{children}</SettingsFlushContext>
}

export function useSettingsFlushContext() {
  return use(SettingsFlushContext)
}

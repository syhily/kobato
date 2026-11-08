import { type ReactNode, createContext, use, useCallback, useMemo, useRef } from 'react'

import { getLogger } from '@/client/lib/logger'

const log = getLogger('settings.flush')

// Flush registry for /admin/settings: each `useSettingsCard` registers its
// awaitable flush under a section id. Dirty-checking lives inside each flush,
// so flushing a clean card is a no-op that reports success.

/** A card flush: resolves true when the card is CLEAN (nothing left to save). */
export type SettingsFlushFn = () => boolean | Promise<boolean> | undefined

interface SettingsFlushContextValue {
  /** Register a flush fn under a section id. Returns an unregister fn. */
  registerFlush: (sectionId: string, fn: SettingsFlushFn) => () => void
  /**
   * Fire-and-forget every registered flush (close / ESC / scroll-away /
   * page-hide). Rejections are swallowed and logged — these callers cannot
   * await.
   */
  flushAll: () => void
  /** Fire-and-forget the flush fns registered under `sectionId`. */
  flushSection: (sectionId: string) => void
  /**
   * Await every registered flush; true only when EVERY card is clean (all
   * dirty fields committed). Any validation failure, rejected commit or thrown
   * flush reports false. Used by the locale switch, which must never reload
   * with unsaved edits.
   */
  flushAllAndWait: () => Promise<boolean>
}

function collect(flushMap: Map<string, Set<SettingsFlushFn>>, sectionId?: string): SettingsFlushFn[] {
  const fns: SettingsFlushFn[] = []
  for (const [id, set] of flushMap) {
    if (sectionId !== undefined && id !== sectionId) {
      continue
    }
    fns.push(...set)
  }
  return fns
}

// No-op default keeps `useSettingsCard` safe in tests without the provider:
// an unregistered card has nothing to flush, so waiting reports success.
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
  flushAllAndWait: async () => true,
})

export function SettingsFlushProvider({ children }: { children: ReactNode }) {
  const flushMapRef = useRef<Map<string, Set<SettingsFlushFn>>>(new Map())

  const registerFlush = useCallback((sectionId: string, fn: SettingsFlushFn) => {
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

  const settle = useCallback(async (sectionId?: string): Promise<boolean> => {
    const fns = collect(flushMapRef.current, sectionId)
    if (fns.length === 0) {
      return true
    }
    const results = await Promise.all(
      fns.map(async (fn) => {
        try {
          return (await fn()) !== false
        } catch (error) {
          log.warn('settings card flush threw', { error })
          return false
        }
      }),
    )
    return results.every(Boolean)
  }, [])

  const flushAll = useCallback(() => {
    void settle().catch((error: unknown) => {
      log.warn('settings flushAll failed', { error })
    })
  }, [settle])

  const flushSection = useCallback(
    (sectionId: string) => {
      void settle(sectionId).catch((error: unknown) => {
        log.warn('settings flushSection failed', { sectionId, error })
      })
    },
    [settle],
  )

  const flushAllAndWait = useCallback(() => settle(), [settle])

  const value = useMemo(
    () => ({ registerFlush, flushAll, flushSection, flushAllAndWait }),
    [registerFlush, flushAll, flushSection, flushAllAndWait],
  )

  return <SettingsFlushContext value={value}>{children}</SettingsFlushContext>
}

export function useSettingsFlushContext() {
  return use(SettingsFlushContext)
}

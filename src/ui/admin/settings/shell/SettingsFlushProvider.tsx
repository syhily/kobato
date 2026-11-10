import { type ReactNode, createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getLogger } from '@/client/lib/logger'
import { useLocaleSyncHostRegistration } from '@/ui/lib/LocaleSyncProvider'

const log = getLogger('settings.flush')

// Flush registry for /admin/settings: each `useSettingsCard` registers its
// awaitable flush under a section id. Dirty-checking lives inside each flush,
// so flushing a clean card is a no-op that reports success.

/** A card flush: resolves true when the card is CLEAN (nothing left to save). */
export type SettingsFlushFn = () => boolean | Promise<boolean> | undefined

interface SettingsFlushContextValue {
  /** Register a flush fn under a section id. Returns an unregister fn. */
  registerFlush: (sectionId: string, fn: SettingsFlushFn) => () => void
  /** Fire-and-forget every registered flush (close / ESC / scroll-away / page-hide); callers cannot await. */
  flushAll: () => void
  /** Fire-and-forget the flush fns registered under `sectionId`. */
  flushSection: (sectionId: string) => void
  /** Await every registered flush; true only when EVERY card is clean. Any failure reports false. */
  flushAllAndWait: () => Promise<boolean>
  /**
   * Run a cross-card transaction (the locale switch: flush dirty cards →
   * commit the locale field → reload) with the workspace pending and `inert`.
   * Nested calls share the outer transaction.
   *
   * `focusAnchor` is the control to re-focus after the window: an explicit
   * element survives a portal option unmounting, and an explicit `null` means
   * "no anchor". Omitting it keeps an unconsumed anchor from a just-finished
   * transaction, else the active element at start.
   */
  runTransaction: <T>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null) => Promise<T>
  /** True while a cross-card transaction is in flight. The workspace is inert. */
  isTransactionPending: boolean
}

async function runTaskWithoutProvider<T>(task: () => T | Promise<T>): Promise<T> {
  // A component using the hook without the workspace provider cannot make the
  // settings panel inert; surface the misconfiguration instead of silently
  // disabling that safety net. Card-level tests may still render without it.
  log.warn('settings transaction ran without SettingsFlushProvider; workspace inert is disabled')
  return task()
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

// The flush registry's default is a no-op for card-level tests without the
// provider; `runTransaction` is the exception — it still runs the task and logs
// the missing-provider misconfiguration (see `runTaskWithoutProvider`).
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
  runTransaction: runTaskWithoutProvider,
  isTransactionPending: false,
})

export function SettingsFlushProvider({ children }: { children: ReactNode }) {
  const flushMapRef = useRef<Map<string, Set<SettingsFlushFn>>>(new Map())
  const [isTransactionPending, setIsTransactionPending] = useState(false)
  const transactionDepthRef = useRef(0)
  const registerLocaleSyncHost = useLocaleSyncHostRegistration()
  // The focused control loses focus when its subtree goes inert; restore it
  // after the transaction so a vetoed locale switch leaves the admin where
  // they were.
  const restoreFocusRef = useRef<HTMLElement | null>(null)

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

  const runTransaction = useCallback(<T,>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null): Promise<T> => {
    if (transactionDepthRef.current === 0) {
      if (focusAnchor !== undefined) {
        // Explicit anchor wins — including `null` ("no anchor"), which cancels
        // an unconsumed anchor from an earlier transaction.
        restoreFocusRef.current = focusAnchor
      } else if (restoreFocusRef.current === null) {
        // No explicit anchor and nothing pending: fall back to whatever had
        // focus when the window opened. An unconsumed anchor from a
        // back-to-back transaction is preserved instead.
        const active = document.activeElement
        restoreFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
      }
      setIsTransactionPending(true)
    }
    transactionDepthRef.current += 1
    return (async () => {
      try {
        return await task()
      } finally {
        transactionDepthRef.current -= 1
        if (transactionDepthRef.current === 0) {
          setIsTransactionPending(false)
        }
      }
    })()
  }, [])

  useEffect(() => {
    if (isTransactionPending) {
      return
    }
    if (restoreFocusRef.current === null) {
      return
    }
    // Defer one frame so the transaction participants' own state updates (the
    // locale switch clears `isSwitching` in a microtask AFTER the transaction
    // flag) commit and re-enable the control before it takes focus back.
    const frame = requestAnimationFrame(() => {
      const target = restoreFocusRef.current
      if (target === null) {
        return
      }
      // A stale/lost target is not worth chasing; the next transaction starts
      // from a fresh anchor.
      if (!target.isConnected || target.closest('[inert]') !== null) {
        restoreFocusRef.current = null
        return
      }
      // Never steal focus if the admin already moved somewhere else (outside
      // the inert workspace) during the transaction.
      if (document.activeElement !== null && document.activeElement !== document.body) {
        restoreFocusRef.current = null
        return
      }
      if (target.matches(':disabled')) {
        restoreFocusRef.current = null
        return
      }
      target.focus({ preventScroll: true })
      restoreFocusRef.current = null
    })
    // A new transaction may start before this frame runs; the cleanup cancels
    // the restore but KEEPS the unconsumed anchor for the next settle.
    return () => cancelAnimationFrame(frame)
  }, [isTransactionPending])

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

  // The root locale-sync loop runs this workspace's transaction when a peer
  // announces a committed locale: flush every dirty card, then reload — the
  // same shape as a local switch, minus the locale commit.
  useEffect(
    () =>
      registerLocaleSyncHost({
        runTransaction,
        flushAllAndWait,
        // Reading the transaction depth at call time: exact without a render-time ref write.
        isBusy: () => transactionDepthRef.current > 0,
      }),
    [registerLocaleSyncHost, runTransaction, flushAllAndWait],
  )

  const value = useMemo(
    () => ({
      registerFlush,
      flushAll,
      flushSection,
      flushAllAndWait,
      runTransaction,
      isTransactionPending,
    }),
    [registerFlush, flushAll, flushSection, flushAllAndWait, runTransaction, isTransactionPending],
  )

  return <SettingsFlushContext value={value}>{children}</SettingsFlushContext>
}

export function useSettingsFlushContext() {
  return use(SettingsFlushContext)
}

import { getLogger } from '@kobato/ui/lib/logger'
import { useLocaleSyncHostRegistration } from '@kobato/web-kit/ui/lib/LocaleSyncProvider'
import { type ReactNode, createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const log = getLogger('settings.flush')

export type SettingsFlushFn = () => boolean | Promise<boolean> | undefined

interface SettingsFlushContextValue {
  registerFlush: (sectionId: string, fn: SettingsFlushFn) => () => void
  flushAll: () => void
  flushSection: (sectionId: string) => void
  flushAllAndWait: () => Promise<boolean>
  runTransaction: <T>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null) => Promise<T>
  isTransactionPending: boolean
}

async function runTaskWithoutProvider<T>(task: () => T | Promise<T>): Promise<T> {
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

const SettingsFlushContext = createContext<SettingsFlushContextValue>({
  registerFlush: () => () => undefined,
  flushAll: () => undefined,
  flushSection: () => undefined,
  flushAllAndWait: async () => true,
  runTransaction: runTaskWithoutProvider,
  isTransactionPending: false,
})

export function SettingsFlushProvider({ children }: { children: ReactNode }) {
  const flushMapRef = useRef<Map<string, Set<SettingsFlushFn>>>(new Map())
  const [isTransactionPending, setIsTransactionPending] = useState(false)
  const transactionDepthRef = useRef(0)
  const registerLocaleSyncHost = useLocaleSyncHostRegistration()
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
        restoreFocusRef.current = focusAnchor
      } else if (restoreFocusRef.current === null) {
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
    const frame = requestAnimationFrame(() => {
      const target = restoreFocusRef.current
      if (target === null) {
        return
      }
      if (!target.isConnected || target.closest('[inert]') !== null) {
        restoreFocusRef.current = null
        return
      }
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

  useEffect(
    () =>
      registerLocaleSyncHost({
        runTransaction,
        flushAllAndWait,
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

import { useCallback, useEffect, useRef } from 'react'

// Autosave engine for the page/post editor.
// Debounce (5 s) + hard cap (60 s). Force-flush on `visibilitychange` / `pagehide`.
// Skips when disabled or body hasn't changed since last persist.

export type AutosaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'retrying'; attempt: number; nextAttemptAt: number; message: string }

/**
 * Outcome the flush reports back to the engine. `'conflict'` means the
 * server rejected the write with a revision conflict: the flush itself
 * has already surfaced the conflict state, so the engine must stay
 * silent — a `saved` tick would clobber it, and advancing the
 * lastPersisted baseline would pretend the snapshot landed. Further
 * flushes are frozen by the caller's `enabled` gate (the persist layer
 * disables autosave until the conflict is resolved).
 */
export type AutosaveFlushOutcome = 'saved' | 'conflict'

export interface UseAutosaveOptions<TBody> {
  body: TBody
  enabled: boolean
  flush: (body: TBody) => Promise<AutosaveFlushOutcome | void>
  debounceMs?: number
  hardCapMs?: number
  retryDelaysMs?: number[]
  onStatusChange?: (status: AutosaveStatus) => void
}

// Exported so tests can pin the ladder (fix-review): the 1s/3s/9s
// backoff is part of the editor's UX contract, not an impl detail.
export const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000, 9_000]

export function useAutosave<TBody>({
  body,
  enabled,
  flush,
  debounceMs = 5_000,
  hardCapMs = 60_000,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  onStatusChange,
}: UseAutosaveOptions<TBody>): { forceFlush: () => Promise<void>; markPersisted: (body: TBody) => void } {
  const flushRef = useRef(flush)
  const bodyRef = useRef(body)
  const enabledRef = useRef(enabled)
  const onStatusRef = useRef(onStatusChange)
  const retryDelaysRef = useRef(retryDelaysMs)
  // Keep latest props in refs without writing during render — effects run after
  // commit, so callbacks always read the freshest values via these refs.
  useEffect(() => {
    flushRef.current = flush
    bodyRef.current = body
    enabledRef.current = enabled
    onStatusRef.current = onStatusChange
    retryDelaysRef.current = retryDelaysMs
  })

  const lastPersistedRef = useRef<TBody | null>(null)
  const inFlightRef = useRef<Promise<AutosaveFlushOutcome | void> | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Breaks the recursive self-reference inside doFlush's retry path so the
  // compiler doesn't have to capture `doFlush` before it's declared.
  const doFlushRef = useRef<(attempt?: number) => Promise<void>>(() => Promise.resolve())

  const emit = useCallback((status: AutosaveStatus) => {
    onStatusRef.current?.(status)
  }, [])

  const doFlush = useCallback(
    async (attempt = 0): Promise<void> => {
      if (!enabledRef.current) {
        return
      }
      if (lastPersistedRef.current === bodyRef.current) {
        return
      }
      if (inFlightRef.current !== null) {
        try {
          await inFlightRef.current
        } catch {
          // Previous flush failed; fall through to retry below.
        }
      }
      const snapshot = bodyRef.current
      emit({ kind: 'saving' })
      const promise = flushRef.current(snapshot)
      inFlightRef.current = promise
      try {
        const outcome = await promise
        if (outcome === 'conflict') {
          // Server-side revision conflict — the flush surfaced it; do
          // not clobber with a `saved` tick, do not advance the baseline.
          return
        }
        lastPersistedRef.current = snapshot
        emit({ kind: 'saved', at: Date.now() })
      } catch (cause) {
        const delays = retryDelaysRef.current
        if (attempt >= delays.length) {
          const message = cause instanceof Error ? cause.message : '保存失败，本地已保留。'
          emit({
            kind: 'retrying',
            attempt: delays.length,
            nextAttemptAt: Date.now(),
            message: `本地已保留：${message}`,
          })
          return
        }
        const delay = delays[attempt] ?? delays[delays.length - 1] ?? 1_000
        const message = cause instanceof Error ? cause.message : '保存失败'
        emit({
          kind: 'retrying',
          attempt: attempt + 1,
          nextAttemptAt: Date.now() + delay,
          message,
        })
        if (retryTimerRef.current !== null) {
          clearTimeout(retryTimerRef.current)
        }
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          void doFlushRef.current(attempt + 1)
        }, delay)
      } finally {
        if (inFlightRef.current === promise) {
          inFlightRef.current = null
        }
      }
    },
    [emit],
  )

  useEffect(() => {
    doFlushRef.current = doFlush
  }, [doFlush])

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      void doFlush()
    }, debounceMs)
    if (hardCapTimerRef.current === null) {
      hardCapTimerRef.current = setTimeout(() => {
        hardCapTimerRef.current = null
        void doFlush()
      }, hardCapMs)
    }
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [body, enabled, debounceMs, hardCapMs, doFlush])

  useEffect(() => {
    if (!enabled) {
      return
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        void doFlush()
      }
    }
    function onPageHide() {
      void doFlush()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [enabled, doFlush])

  useEffect(() => {
    return () => {
      if (hardCapTimerRef.current !== null) {
        clearTimeout(hardCapTimerRef.current)
        hardCapTimerRef.current = null
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [])

  const forceFlush = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    await doFlush()
  }, [doFlush])

  /**
   * Advance the persisted baseline to a body that was persisted outside
   * the engine (a manual Ctrl+S save). The next debounce tick's reference
   * check then short-circuits instead of re-flushing the same body.
   */
  const markPersisted = useCallback((persistedBody: TBody): void => {
    lastPersistedRef.current = persistedBody
  }, [])

  return { forceFlush, markPersisted }
}

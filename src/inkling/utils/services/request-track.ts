/**
 * The request track — the async-flow skeleton behind the editor's debounced search flows:
 * the scheduler port (`RequestScheduler` + `defaultScheduler`; tests inject a manual one so
 * every race matrix is a synchronous test table) and the latest-wins request guard
 * (`createRequestTrack`). The snapshot store lives in snapshot-store.ts; the gif browser,
 * the library browser, and the link-search coordinator compose their own policy on top.
 * Per-module scheduler aliases of `RequestScheduler` survive (the public `LibraryScheduler`
 * must not break).
 */

/** Scheduler port for debounced dispatches — tests inject a manual one. */
export interface RequestScheduler {
  schedule: (fn: () => void, ms: number) => () => void
}

export const defaultScheduler: RequestScheduler = {
  schedule(fn, ms) {
    const id = setTimeout(fn, ms)
    return () => {
      clearTimeout(id)
    }
  },
}

export interface RequestTrack {
  /** Begin a new generation, superseding every in-flight request; returns the generation to guard on. */
  next: () => number
  /** The current generation — requests that deliberately join it (gif's load-more) guard on this. */
  current: () => number
  /** False once a newer generation has started — check after every await. */
  isLatest: (generation: number) => boolean
  /** Schedule a dispatch through the debounce port, cancelling the pending one. */
  schedule: (fn: () => void, ms: number) => void
  /** Cancel the pending scheduled dispatch without touching generations. */
  cancelScheduled: () => void
  /** Cancel the pending dispatch and supersede every in-flight request (adapter unmount / recreation). */
  dispose: () => void
}

/**
 * The latest-wins request guard with its dispatch scheduling and dispose
 * lifecycle. One track per independent request line — the search
 * coordinator runs two (the debounced query track and the default-options
 * prefetch), the gif and library browsers one each.
 */
export function createRequestTrack({
  scheduler = defaultScheduler,
}: { scheduler?: RequestScheduler } = {}): RequestTrack {
  let generation = 0
  let cancelScheduled: (() => void) | null = null
  return {
    next() {
      generation += 1
      return generation
    },
    current: () => generation,
    isLatest: (candidate) => candidate === generation,
    schedule(fn, ms) {
      cancelScheduled?.()
      cancelScheduled = scheduler.schedule(() => {
        cancelScheduled = null
        fn()
      }, ms)
    },
    cancelScheduled() {
      cancelScheduled?.()
      cancelScheduled = null
    },
    dispose() {
      cancelScheduled?.()
      cancelScheduled = null
      generation += 1
    },
  }
}

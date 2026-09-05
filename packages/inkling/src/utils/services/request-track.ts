/**
 * The request track — the one home of the async-flow skeleton behind the
 * editor's debounced search flows (CONTEXT.md "request track"). Two
 * primitives, each previously hand-copied per flow:
 *
 * - the scheduler port (`RequestScheduler` + `defaultScheduler`) — tests
 *   inject a manual one, so every race matrix below is a synchronous test
 *   table instead of renderHook + wall-clock sleeps;
 * - the latest-wins request guard (`createRequestTrack`) — a newer request
 *   supersedes every in-flight one, so a slow response can never overwrite
 *   newer results, plus the scheduled-dispatch cancellation and the dispose
 *   lifecycle (cancel pending + supersede in-flight).
 *
 * The snapshot store the flows publish through lives in its own module
 * (src/utils/services/snapshot-store.ts) — it is shared with state modules
 * that have no request line (the menu navigator, the gallery images
 * mirror, the composer handle).
 *
 * The gif browser (src/utils/services/gif-browser.ts), the library browser
 * (src/utils/services/library-browser.ts), and the link-search coordinator
 * (src/hooks/search-coordinator.ts) compose their own policy on top —
 * pagination, the prefetch track, the URL short-circuit stay per-module
 * data — over the shared tracked-request skeleton and dispatch protocol in
 * src/utils/services/service-machine.ts. Their per-module scheduler type
 * names survive as aliases of `RequestScheduler` (the public
 * `LibraryScheduler` must not break).
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

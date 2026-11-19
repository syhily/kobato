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
  next: () => number

  current: () => number

  isLatest: (generation: number) => boolean

  schedule: (fn: () => void, ms: number) => void
  cancelScheduled: () => void
  dispose: () => void
}

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

import { createRequestTrack, type RequestScheduler } from '@kobato/inkling-internal/services/request-track'
import { runTrackedRequest, type ServiceMachine } from '@kobato/inkling-internal/services/service-machine'
import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'
export const LIBRARY_SEARCH_DEBOUNCE_MS = 300

export interface LibraryBrowserSnapshot<TItem> {
  items: TItem[]
  isLoading: boolean
  error: string | null
}

export type LibraryBrowserIntent = { type: 'search'; term: string }

export type LibraryScheduler = RequestScheduler

export type LibraryBrowser<TItem> = ServiceMachine<LibraryBrowserSnapshot<TItem>, LibraryBrowserIntent>

export function createLibraryBrowser<TItem>({
  search,
  scheduler,
  debounceMs = LIBRARY_SEARCH_DEBOUNCE_MS,
}: {
  search: (query: string) => Promise<TItem[] | undefined>
  scheduler?: LibraryScheduler
  debounceMs?: number
}): LibraryBrowser<TItem> {
  const store = createSnapshotStore<LibraryBrowserSnapshot<TItem>>({ items: [], isLoading: false, error: null })
  const track = createRequestTrack({ scheduler })
  const runSearch = async (generation: number, term: string): Promise<void> => {
    store.emit({ error: null, isLoading: true })

    const outcome = await runTrackedRequest(track, generation, () => search(term))

    if (!outcome) {
      return
    }

    if (!outcome.ok) {
      store.emit({
        error: outcome.error instanceof Error ? outcome.error.message : 'Unknown error',
        isLoading: false,
      })
    } else if (outcome.value !== undefined) {
      store.emit({ items: outcome.value, isLoading: false })
    } else {
      store.emit({ isLoading: false })
    }
  }

  const startSearch = (term: string): void => {
    void runSearch(track.next(), term)
  }

  const setSearch = (term: string): void => {
    track.cancelScheduled()

    if (term === '') {
      startSearch(term)
      return
    }

    track.schedule(() => {
      startSearch(term)
    }, debounceMs)
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,

    dispatch(intent: LibraryBrowserIntent) {
      switch (intent.type) {
        case 'search':
          setSearch(intent.term)
      }
      return []
    },

    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}

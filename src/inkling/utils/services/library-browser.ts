// Library browser — the headless module behind a media-library picker: one debounced
// request track over the host's `search` callback, composed from the service-machine
// primitives. Deliberately smaller than the gif browser: no pagination track, no column
// balancing, no keyboard-navigation machine (tiles are plain buttons, Tab order = DOM
// order), and the effect slot stays `never`. Generic over the item shape so a host's own
// library pickers reuse the machine. The React adapter is `useLibraryBrowser`;
// `LibrarySelector` renders and dispatches intents.

import { createRequestTrack, type RequestScheduler } from '@/inkling/utils/services/request-track'
import { runTrackedRequest, type ServiceMachine } from '@/inkling/utils/services/service-machine'
import { createSnapshotStore } from '@/inkling/utils/services/snapshot-store'

export const LIBRARY_SEARCH_DEBOUNCE_MS = 300

export interface LibraryBrowserSnapshot<TItem> {
  items: TItem[]
  isLoading: boolean
  error: string | null
}

export type LibraryBrowserIntent = { type: 'search'; term: string }

/** Scheduler port for the debounced query track — the public alias of the request track's `RequestScheduler`. */
export type LibraryScheduler = RequestScheduler

/** A service machine whose intents only move the snapshot — the effect slot stays `never` until an intent needs one. */
export type LibraryBrowser<TItem> = ServiceMachine<LibraryBrowserSnapshot<TItem>, LibraryBrowserIntent>

/**
 * Single request track (no pagination, no prefetch track): an empty term
 * fires immediately (the default listing); non-empty terms are debounced.
 * Latest-wins: stale/superseded responses never overwrite; a rejection
 * preserves the last items and sets `error`; `undefined` resolves like a
 * cancellation (search-coordinator.ts convention).
 */
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

    /** Cancel the pending search, invalidate every in-flight request, and drop the store's listeners. */
    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}

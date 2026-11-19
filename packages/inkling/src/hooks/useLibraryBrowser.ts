import { useDisposableStore } from '@kobato/inkling-internal/hooks/useDisposableStore'
import {
  createLibraryBrowser,
  type LibraryBrowser,
  type LibraryScheduler,
} from '@kobato/inkling-internal/services/library-browser'

interface UseLibraryBrowserOptions<TItem> {
  search: (query: string) => Promise<TItem[] | undefined>
  scheduler?: LibraryScheduler
  debounceMs?: number
}

export function useLibraryBrowser<TItem>({
  search,
  scheduler,
  debounceMs,
}: UseLibraryBrowserOptions<TItem>): LibraryBrowser<TItem> {
  return useDisposableStore(
    () => createLibraryBrowser<TItem>({ search, scheduler, debounceMs }),
    [search, scheduler, debounceMs],
  )
}

import type { RefObject } from 'react'

import { useEffect, useRef } from 'react'

// Shared IntersectionObserver driver for infinite-scroll lists. Consumers
// mount the returned ref on a trailing sentinel div; once the sentinel
// scrolls within `rootMargin` of the root (the viewport by default),
// `fetchNextPage` fires.
//
// The observer only re-arms while there IS a next page and no page fetch
// is in flight, so a single intersection can never double-fire a request.
// Used by `useAdminInfiniteList` and directly by surfaces with custom
// scroll roots (the meting-search dialog/view).
export function useInfiniteScrollSentinel<TElement extends HTMLElement = HTMLDivElement>({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  root,
  rootMargin = '200px',
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  /** Intersection root; defaults to the viewport. Passed as a ref object
   *  (read at arm time, not during render) so scroll containers that mount
   *  after first render — e.g. dialog bodies — work. */
  root?: RefObject<Element | null>
  rootMargin?: string
}): RefObject<TElement | null> {
  const sentinelRef = useRef<TElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage || isFetchingNextPage) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchNextPage()
        }
      },
      { root: root?.current ?? null, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, root, rootMargin])

  return sentinelRef
}

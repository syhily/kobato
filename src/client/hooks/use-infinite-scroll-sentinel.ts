import type { RefObject } from 'react'

import { useEffect, useRef } from 'react'

// Shared IntersectionObserver driver for infinite-scroll lists. Consumers
// mount the returned ref on a trailing sentinel div; once the sentinel
// scrolls within `rootMargin` of the viewport, `fetchNextPage` fires.
//
// The observer only re-arms while there IS a next page and no page fetch
// is in flight, so a single intersection can never double-fire a request.
// Used by the admin comment surfaces (`useCommentsController` for
// `CommentsView`, and `MyCommentsView` directly) so both lists share one
// sentinel implementation.
export function useInfiniteScrollSentinel<TElement extends HTMLElement = HTMLDivElement>({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = '200px',
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
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
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin])

  return sentinelRef
}

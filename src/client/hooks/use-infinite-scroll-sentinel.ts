import type { RefObject } from 'react'

import { useEffect, useRef } from 'react'

// Shared IntersectionObserver driver for infinite-scroll lists: consumers
// mount the returned ref on a trailing sentinel; intersection fires
// `fetchNextPage`. The observer only arms while a next page exists and no
// fetch is in flight, so a single intersection can't double-fire.
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
  /** Intersection root (defaults to the viewport); read at arm time so late-mounting scroll containers work. */
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

import type { FragmentInstance, RefObject } from 'react'

import { useEffect, useRef } from 'react'

// Shared IntersectionObserver driver for infinite-scroll lists: consumers
// wrap the list's LAST item in `<Fragment ref={sentinelRef}>` and the
// observer watches that fragment's first-level DOM children; intersection
// fires `fetchNextPage`. The observer only arms while a next page exists
// and no fetch is in flight, so a single intersection can't double-fire.
// `tailKey` identifies the currently observed tail item — when a page
// fetch lands and the tail moves to a new item, the effect re-arms against
// the new fragment instance.
export function useInfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  root,
  rootMargin = '200px',
  tailKey,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  /** Intersection root (defaults to the viewport); read at arm time so late-mounting scroll containers work. */
  root?: RefObject<Element | null>
  rootMargin?: string
  /** Identity of the currently observed tail item — changing it re-arms the observer against the new tail (e.g. last item id or items.length). */
  tailKey: unknown
}): RefObject<FragmentInstance | null> {
  const sentinelRef = useRef<FragmentInstance>(null)

  useEffect(() => {
    const instance = sentinelRef.current
    if (!instance || !hasNextPage || isFetchingNextPage) {
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
    instance.observeUsing(observer)
    return () => {
      instance.unobserveUsing(observer)
      observer.disconnect()
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- tailKey is the deliberate re-arm trigger: a new tail item mounts a new fragment instance the observer must re-observe
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, root, rootMargin, tailKey])

  return sentinelRef
}

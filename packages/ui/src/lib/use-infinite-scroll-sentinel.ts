import type { FragmentInstance, RefCallback, RefObject } from 'react'

import { useCallback, useEffect, useState } from 'react'

// Arming follows the fragment's ACTUAL mount through a callback ref (not
// just the effect deps): a tail that mounts a commit after the gating deps
// settle — the justified image grid renders a skeleton until its container
// width measures — must still arm once the fragment appears. `tailKey`
// identifies the currently observed tail item — when a page fetch lands
// and the tail moves to a new item, the effect re-arms against the new
// fragment instance.
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
  tailKey: unknown
}): RefCallback<FragmentInstance> {
  const [instance, setInstance] = useState<FragmentInstance | null>(null)
  const sentinelRef = useCallback((next: FragmentInstance | null) => {
    setInstance(next)
  }, [])

  useEffect(() => {
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
  }, [instance, hasNextPage, isFetchingNextPage, fetchNextPage, root, rootMargin, tailKey])

  return sentinelRef
}

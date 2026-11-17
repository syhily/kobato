import { useSyncExternalStore } from 'react'

/** Reactive `window.matchMedia` boolean — server snapshot avoids hydration mismatches. */
export function useMediaQuery(query: string, defaultMatch = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => defaultMatch,
  )
}

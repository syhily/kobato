import { useEffect, useState } from 'react'

/**
 * Reactive `window.matchMedia` boolean. Initial value is synchronous
 * (client: `window.matchMedia`, server: `defaultMatch`) to avoid
 * post-hydration flashes and portal-based dialog glitches.
 */
export function useMediaQuery(query: string, defaultMatch = false): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultMatch
    }
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    const mql = window.matchMedia(query)
    // Re-sync in case the resolved match changed between the lazy
    // initial read and the effect (rare — but possible if `query`
    // changed across renders).
    setMatches(mql.matches)
    const update = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return matches
}

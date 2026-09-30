import { useEffect, useState } from 'react'
import { useRouteLoaderData } from 'react-router'

// Day-granularity consumers only need a minute-scale refresh to roll over at midnight / New-Year.
const REFRESH_MS = 60_000

/**
 * Hydration-safe clock (audits P2-23 / V3-08): SSR + first hydration use the root
 * loader's `nowIso`; after mount, switch to the live clock — the loader never re-runs.
 */
export function useChromeClock(): Date {
  const nowIso = useRouteLoaderData<{ nowIso?: string }>('root')?.nowIso
  // Router-less renders (tests) have no loader clock — anchor on a mount-time
  // reading instead (the lazy initializer keeps render pure).
  const [fallbackNow] = useState(() => new Date())
  const [mountedNow, setMountedNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setMountedNow(new Date())
    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return mountedNow ?? (nowIso === undefined ? fallbackNow : new Date(nowIso))
}

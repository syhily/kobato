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
  const [mountedNow, setMountedNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setMountedNow(new Date())
    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  // The `new Date()` fallback only fires in router-less test renders.
  return mountedNow ?? (nowIso === undefined ? new Date() : new Date(nowIso))
}

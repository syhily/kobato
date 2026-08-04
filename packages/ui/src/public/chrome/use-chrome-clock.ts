import { useEffect, useState } from 'react'
import { useRouteLoaderData } from 'react-router'

// Day-granularity consumers (footer year, sidebar calendar PNG) only need a
// minute-scale refresh to roll over correctly at midnight / New-Year.
const REFRESH_MS = 60_000

/**
 * Hydration-safe clock for the public chrome (audits P2-23 / V3-08).
 *
 * SSR and the first hydration render MUST use the root loader's `nowIso` so
 * server and client agree on the same instant. But the root loader never
 * re-runs on soft navigations (`shouldRevalidate` in `src/root.tsx`), so a
 * long-lived tab would keep that baked instant forever — after mount we
 * switch to the live client clock and refresh it every minute, letting the
 * footer year and calendar image roll over without a hard refresh.
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

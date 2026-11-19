import { useEffect, useState } from 'react'
import { useRouteLoaderData } from 'react-router'

const REFRESH_MS = 60_000

/**
 * Hydration-safe clock: SSR and first hydration use the root loader's `nowIso`; after mount,
 * switch to the live clock, since the loader never re-runs.
 */
export function useChromeClock(): Date {
  const nowIso = useRouteLoaderData<{ nowIso?: string }>('root')?.nowIso
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

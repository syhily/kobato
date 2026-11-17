import { useEffect, useState } from 'react'

/**
 * A minute-cadence clock for live relative timestamps ("3 分钟前"). The
 * interval callback keeps the setState out of the effect body
 * (react/set-state-in-effect) while the tick re-renders the consumer so
 * `formatNotificationTime(iso, { locale, timeZone, now })` recomputes.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

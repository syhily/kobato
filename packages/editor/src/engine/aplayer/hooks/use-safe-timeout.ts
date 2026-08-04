import { useCallback, useEffect, useRef } from 'react'

export function useSafeTimeout() {
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      for (const timeout of timeouts) {
        clearTimeout(timeout)
      }
    }
  }, [timeoutsRef])

  const safeSetTimeout = useCallback((callback: () => void, ms: number) => {
    const timeout = setTimeout(callback, ms)
    timeoutsRef.current.push(timeout)
    return timeout
  }, [])

  return safeSetTimeout
}

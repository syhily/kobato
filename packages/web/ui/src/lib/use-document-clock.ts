import { useDocumentFacts } from '@kobato/ui/lib/document-facts-context'
import { useEffect, useState } from 'react'

const REFRESH_MS = 60_000

export function useDocumentClock(): Date {
  const nowIso = useDocumentFacts().nowIso
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

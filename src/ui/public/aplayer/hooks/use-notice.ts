import { useCallback, useRef, useState } from 'react'

import { useSafeTimeout } from '@/ui/public/aplayer/hooks/use-safe-timeout'

export function useNotice() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notice, setNotice] = useState({ text: '', style: { opacity: 0 } })
  const setTimeout = useSafeTimeout()

  const showNotice = useCallback(
    (text: string, duration = 2000) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      setNotice({ text, style: { opacity: 1 } })
      timerRef.current = setTimeout(() => {
        setNotice({ text, style: { opacity: 0 } })
      }, duration)
    },
    [setTimeout],
  )

  return [notice, showNotice] as const
}

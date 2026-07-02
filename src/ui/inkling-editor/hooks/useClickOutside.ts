import React from 'react'

export function useClickOutside(
  enabled: boolean,
  ref: React.RefObject<HTMLElement | null>,
  handler: (event?: MouseEvent) => void,
): void {
  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler(event)
      }
    }

    window.addEventListener('mousedown', handleClickOutside, { capture: true })
    return () => window.removeEventListener('mousedown', handleClickOutside, { capture: true })
  }, [enabled, handler, ref])
}

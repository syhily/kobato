import { type RefObject, useEffect } from 'react'
export function useClickOutside(
  enabled: boolean,
  ref: RefObject<HTMLElement | null>,
  handler: (event?: MouseEvent) => void,
): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target
      if (ref.current && (!(target instanceof Node) || !ref.current.contains(target))) {
        handler(event)
      }
    }

    window.addEventListener('mousedown', handleClickOutside, { capture: true })
    return () => window.removeEventListener('mousedown', handleClickOutside, { capture: true })
  }, [enabled, handler, ref])
}

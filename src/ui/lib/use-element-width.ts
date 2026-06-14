import { useLayoutEffect, useRef, useState } from 'react'

interface UseElementWidthResult<T extends HTMLElement> {
  ref: React.RefObject<T | null>
  width: number
}

/**
 * Reactive width of a DOM element. Returns `0` until the element is
 * measured on the client, so SSR snapshots stay stable.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(): UseElementWidthResult<T> {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }

    let raf: number
    const update = () => {
      const next = el.clientWidth
      setWidth((prev) => (prev === next ? prev : next))
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    })

    observer.observe(el)
    update()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return { ref, width }
}

import { type RefObject, useEffect } from 'react'

// Lazy-loads medium-zoom for images + SVGs. MutationObserver (not the
// selector overload) so same-route navigations pick up new images; cleanup
// detaches everything on unmount.
export function useMediumZoom(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let cancelled = false
    let cleanup: (() => void) | undefined

    void (async () => {
      const [{ default: mediumZoom }] = await Promise.all([
        import('medium-zoom/dist/pure'),
        import('medium-zoom/dist/style.css'),
      ])
      if (cancelled) {
        return
      }

      const zoom = mediumZoom()

      const attachAll = () => {
        const targets = container.querySelectorAll<HTMLImageElement | SVGElement>('img, svg')
        if (targets.length > 0) {
          zoom.attach(targets)
        }
      }

      attachAll()

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            attachAll()
            return
          }
        }
      })
      observer.observe(container, { childList: true, subtree: true })

      cleanup = () => {
        observer.disconnect()
        zoom.detach()
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [containerRef])
}

import { type RefObject, useEffect } from 'react'

// Attach medium-zoom behaviour to images + SVGs inside the passed-in
// container element. Lazy-loads the library so it stays out of the
// initial bundle; the effect no-ops on SSR because `useEffect` does not
// fire during renderToString.
//
// We deliberately avoid the `mediumZoom('selector')` overload — React
// Router reuses the same `PostDetailBody` / `PageDetailBody` component
// instance across `/posts/a` → `/posts/b` navigations (same route ID),
// so a one-shot `attach('.post-content img')` in a `useEffect(_, [])`
// would silently not pick up the new article's images. Instead:
//
// - Caller passes a ref to the local `.post-content` wrapper, so we
//   only ever zoom this article's media (no leak into sidebar widgets
//   or any other `.post-content` that might exist elsewhere).
// - We do an initial attach pass and set up a `MutationObserver` so
//   late-arriving images (lazy-loaded PortableText blocks,
//   IntersectionObserver-driven reveal animations, etc.) are picked up
//   the moment they enter the container — fixing the race that
//   previously depended on whether the body had committed before the
//   first effect ran.
// - Cleanup detaches everything currently attached and disconnects the
//   observer, so a route swap (or the container element being
//   re-mounted) cannot leave dangling listeners on stale `<img>` nodes.
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

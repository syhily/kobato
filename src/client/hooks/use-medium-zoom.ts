import type { Zoom } from 'medium-zoom'

import { type RefObject, useEffect } from 'react'

// Lazy-loads medium-zoom for images + SVGs. MutationObserver (not the
// selector overload) so same-route navigations pick up new images; cleanup
// detaches everything on unmount.
//
// The zoom instance is a module-level singleton: every `mediumZoom()` call
// registers document/window listeners (click, keyup, scroll, resize) that the
// library never removes, so a per-mount instance leaks one listener set per
// navigation. `attach()` also re-adds listeners to every passed image without
// deduping, so each effect tracks its own attached set and only passes new
// elements.
let zoomPromise: Promise<Zoom> | undefined

function getSharedZoom(): Promise<Zoom> {
  zoomPromise ??= Promise.all([import('medium-zoom/dist/pure'), import('medium-zoom/dist/style.css')]).then(
    ([{ default: mediumZoom }]) => mediumZoom(),
  )
  return zoomPromise
}

export function useMediumZoom(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let cancelled = false
    let cleanup: (() => void) | undefined

    void getSharedZoom().then((zoom) => {
      if (cancelled) {
        return
      }

      const attached = new Set<HTMLImageElement>()

      const attachAll = () => {
        // medium-zoom only supports IMG nodes (`.svg` files ride plain
        // `<img>` tags), so filter to them like the library itself does.
        const targets: HTMLImageElement[] = []
        for (const el of container.querySelectorAll('img, svg')) {
          if (el instanceof HTMLImageElement && !attached.has(el)) {
            targets.push(el)
            attached.add(el)
          }
        }
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
        for (const el of attached) {
          zoom.detach(el)
        }
        attached.clear()
      }
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [containerRef])
}

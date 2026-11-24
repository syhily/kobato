import type { Zoom } from 'medium-zoom'

import { type RefObject, useEffect } from 'react'

let zoomPromise: Promise<Zoom> | undefined

function getSharedZoom(): Promise<Zoom> {
  zoomPromise ??= Promise.all([import('medium-zoom/dist/pure'), import('medium-zoom/dist/style.css')]).then(
    ([{ default: mediumZoom }]) => mediumZoom(),
  )
  return zoomPromise
}

export function useMediumZoom(containerRef: RefObject<HTMLElement | null>, bodyHtml: string): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container || container.querySelector('img') === null) {
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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [containerRef, bodyHtml])
}

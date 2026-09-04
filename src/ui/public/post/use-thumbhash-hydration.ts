import { type RefObject, useEffect } from 'react'

import { thumbHashToDataURL } from '@/shared/utils/thumbhash'

// In-process cache of decoded thumbhash data URLs — many images share decodes.
const decodedUrlCache = new Map<string, string>()

function decodeThumbhash(hash: string): string | undefined {
  const cached = decodedUrlCache.get(hash)
  if (cached !== undefined) {
    return cached
  }
  try {
    const binary = atob(hash)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const url = thumbHashToDataURL(bytes)
    decodedUrlCache.set(hash, url)
    return url
  } catch {
    return undefined
  }
}

// The dSHI twin of `useThumbhashBackground`: exported body images carry their
// placeholder as a `data-thumbhash` attribute (KobatoImageNode exportDOM), so
// the hook paints the decoded blur as a background until the real image has
// loaded. Additive over the SSR `style="aspect-ratio:…"` placeholder.
export function useThumbhashHydration(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const cleanups: (() => void)[] = []
    for (const img of container.querySelectorAll('img[data-thumbhash]')) {
      const hash = img.getAttribute('data-thumbhash')
      if (hash === null || hash === '') {
        continue
      }
      // Already decoded from cache/network — no placeholder needed.
      if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) {
        continue
      }
      const url = decodeThumbhash(hash)
      if (url === undefined || !(img instanceof HTMLImageElement)) {
        continue
      }
      img.style.backgroundImage = `url("${url}")`
      img.style.backgroundPosition = 'center'
      img.style.backgroundSize = 'cover'
      img.style.backgroundRepeat = 'no-repeat'
      const clear = () => {
        img.style.backgroundImage = ''
        img.style.backgroundPosition = ''
        img.style.backgroundSize = ''
        img.style.backgroundRepeat = ''
      }
      img.addEventListener('load', clear, { once: true })
      cleanups.push(() => {
        img.removeEventListener('load', clear)
        clear()
      })
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [containerRef])
}

import { useEffect, useState, type CSSProperties } from 'react'

import { thumbHashToDataURL } from '@/shared/utils/thumbhash'

// In-process cache of decoded thumbhash data URLs. `BlockImage` mounts can fire
// many times for the same hash on a single page (post listing thumbnails,
// repeated images), so we avoid re-running the decode per mount. Keyed on
// the raw thumbhash string for a constant-size hit.
const thumbhashUrlCache = new Map<string, string>()

// Lazily decodes a thumbhash string into a data URL and returns it as a CSS
// style chunk so the placeholder fades behind the real image while it
// downloads. Returns `undefined` until the decode finishes, then a stable
// style object that the host element merges via the `style` prop.
//
// The thumbhash itself is injected at SSR time by the detail-page loader
// (`imageMeta` → `ImageMetaProvider` → `BlockImage`) as `data-thumbhash`
// on the HTML, keyed off the matching row in the runtime `image` table.
// Consumers only need to pass that attribute through to this hook.
//
// This stays a hook (useState + useEffect) rather than a synchronous helper
// because thumbhash decode should only run in the browser. Running it during
// SSR would waste CPU and could leak module-level cache across requests.
export function useThumbhashBackground(thumbhash: string | undefined, loaded = false): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(() => {
    if (loaded || thumbhash === undefined) {
      return undefined
    }
    return styleFromCache(thumbhash)
  })

  useEffect(() => {
    if (loaded || !thumbhash) {
      setStyle(undefined)
      return
    }
    const cached = thumbhashUrlCache.get(thumbhash)
    if (cached !== undefined) {
      setStyle(buildStyle(cached))
      return
    }

    try {
      const dataUrl = thumbHashToDataURL(base64ToBytes(thumbhash))
      thumbhashUrlCache.set(thumbhash, dataUrl)
      setStyle(buildStyle(dataUrl))
    } catch {
      setStyle(undefined)
    }
  }, [thumbhash, loaded])

  return style
}

function styleFromCache(thumbhash: string): CSSProperties | undefined {
  const cached = thumbhashUrlCache.get(thumbhash)
  return cached !== undefined ? buildStyle(cached) : undefined
}

function buildStyle(dataUrl: string): CSSProperties {
  return {
    backgroundImage: `url("${dataUrl}")`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

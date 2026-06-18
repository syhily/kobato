import { useSyncExternalStore, type CSSProperties } from 'react'

import { thumbHashToDataURL } from '@/shared/utils/thumbhash'

// In-process cache of decoded thumbhash style objects. `BlockImage` mounts can
// fire many times for the same hash on a single page (post listing thumbnails,
// repeated images), so we avoid re-running the decode per mount. Keyed on the
// raw thumbhash string for a constant-size hit.
const thumbhashStyleCache = new Map<string, CSSProperties>()

// Lazily decodes a thumbhash string into a CSS style object so the placeholder
// fades behind the real image while it downloads. Returns `undefined` until the
// decode finishes, then a stable style object that the host element merges via
// the `style` prop.
//
// The thumbhash itself is injected at SSR time by the detail-page loader
// (`imageMeta` → `ImageMetaProvider` → `BlockImage`) as `data-thumbhash`
// on the HTML, keyed off the matching row in the runtime `image` table.
// Consumers only need to pass that attribute through to this hook.
//
// `useSyncExternalStore` is used here because:
//   * the server snapshot always returns `undefined`, keeping decode work out
//     of SSR and avoiding hydration mismatches.
//   * the client snapshot can compute synchronously on mount, so the
//     placeholder appears immediately without a render delay.
//   * the cached style object is stable across renders, preventing cascading
//     re-renders from returning a fresh object every time.
export function useThumbhashBackground(thumbhash: string | undefined, loaded = false): CSSProperties | undefined {
  return useSyncExternalStore(
    emptySubscribe,
    () => buildThumbhashStyle(thumbhash, loaded),
    () => undefined,
  )
}

function emptySubscribe(): () => void {
  return () => undefined
}

function buildThumbhashStyle(thumbhash: string | undefined, loaded: boolean): CSSProperties | undefined {
  if (loaded || thumbhash === undefined) {
    return undefined
  }

  const cached = thumbhashStyleCache.get(thumbhash)
  if (cached !== undefined) {
    return cached
  }

  try {
    const dataUrl = thumbHashToDataURL(base64ToBytes(thumbhash))
    const style = buildStyle(dataUrl)
    thumbhashStyleCache.set(thumbhash, style)
    return style
  } catch {
    return undefined
  }
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

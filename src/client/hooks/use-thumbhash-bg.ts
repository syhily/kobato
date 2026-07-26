import { useSyncExternalStore, type CSSProperties } from 'react'

import { thumbHashToDataURL } from '@/shared/utils/thumbhash'

// In-process cache of decoded thumbhash style objects. `BlockImage` mounts can
// fire many times for the same hash on a single page (post listing thumbnails,
// repeated images), so we avoid re-running the decode per mount. Keyed on the
// raw thumbhash string for a constant-size hit.
const thumbhashStyleCache = new Map<string, CSSProperties>()

// Lazily decodes a thumbhash string into a CSS style object so the
// placeholder fades behind the real image while it downloads. Returns
// `undefined` until the decode finishes, then a stable style object.
//
// Uses `useSyncExternalStore`: the server snapshot returns `undefined`
// (no SSR decode), the client snapshot computes synchronously on mount.
// The cached style object is stable across renders.
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

import { useState } from 'react'

/**
 * Tracks the src of the last failed `<img>` preview load. `broken` compares it
 * against the current `src`, so a new src (new value / fallback / cache-buster)
 * retries the load automatically instead of staying hidden forever. Pass `null`
 * when there is nothing to load.
 */
export function useErroredSrc(src: string | null): [broken: boolean, markErrored: () => void] {
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  return [src !== null && erroredSrc === src, () => setErroredSrc(src)]
}

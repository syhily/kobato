import { CHUNKS_SENTINEL } from '@/shared/constants/route-warmup'

// Matches the sentinel literal under any quote style (the oxc minifier emits
// backticks) so a minifier change can't break replacement.
const SENTINEL_PATTERN = new RegExp(`["'\`]${CHUNKS_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`)

/**
 * Replace the `CHUNKS_SENTINEL` placeholder (and its surrounding quotes) with
 * the chunk-list JSON. A function replacement avoids `$` handling; returns the
 * script unchanged when the sentinel is absent (dev).
 */
export function injectWarmupChunks(script: string, chunks: string[]): string {
  return script.replace(SENTINEL_PATTERN, () => JSON.stringify(chunks))
}

import { CHUNKS_SENTINEL } from '@/shared/constants/route-warmup'

// Matches the sentinel literal under any quote style (the oxc minifier emits
// backticks) so a minifier change can't break replacement.
const SENTINEL_PATTERN = new RegExp(`["'\`]${CHUNKS_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`)

/** Swaps the sentinel and its quotes for the chunk-list JSON; a function replacement avoids `$` handling. */
export function injectWarmupChunks(script: string, chunks: string[]): string {
  return script.replace(SENTINEL_PATTERN, () => JSON.stringify(chunks))
}

import { CHUNKS_SENTINEL } from '@kobato/shared/constants/route-warmup'

// Matches the sentinel literal regardless of the minifier's quote style. The
// oxc minifier emits backtick-quoted strings, but the matcher tolerates
// single/double/backtick so it survives a minifier change. The matched quotes
// are consumed (the placeholder, quotes included, becomes the JSON array).
const SENTINEL_PATTERN = new RegExp(`["'\`]${CHUNKS_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`)

/**
 * Injects the per-request chunk list into the pre-minified route-warmup script
 * by replacing the `CHUNKS_SENTINEL` placeholder (and its surrounding quotes)
 * with the chunk-list JSON. A function replacement avoids `$`-special handling
 * in the replacement string (chunk paths may contain `$`). Returns the script
 * unchanged if the sentinel is absent (e.g. dev, where the script is empty).
 */
export function injectWarmupChunks(script: string, chunks: string[]): string {
  return script.replace(SENTINEL_PATTERN, () => JSON.stringify(chunks))
}

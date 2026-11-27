import { CHUNKS_SENTINEL } from '@kobato/base/distribution/route-warmup'

const SENTINEL_PATTERN = new RegExp(`["'\`]${CHUNKS_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`)

export function injectWarmupChunks(script: string, chunks: string[]): string {
  return script.replace(SENTINEL_PATTERN, () => JSON.stringify(chunks))
}

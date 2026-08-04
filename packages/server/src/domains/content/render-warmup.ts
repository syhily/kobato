import type { Database } from '@kobato/server/infra/db/database'

/**
 * The OG render inputs the request path folds into its cache key. The
 * warm target must carry the exact fields the OG route passes to
 * `through()` — a warm under any other inputs fills a key the crawler
 * never asks for.
 */
export interface OgWarmTarget {
  slug: string
  title: string
  summary: string
  cover: string
}

/**
 * The render-cache warmup SEAM. The content domain owns the WHEN
 * (publish/update of a live row, alongside `invalidateContent`) but must
 * not import the render layer — the server layer graph is one-way
 * (infra → domains → render → http). So the HOW lives behind this slot:
 * `@/server/render/warmup/content-cache` wires the implementation at
 * import time (it loads with the HTTP resources that own the OG/calendar
 * request path), and the descriptor hooks knock on
 * `warmContentRenderCaches` below. Unwired = no-op: a publish path that
 * never loaded the render stack simply skips the warm.
 */
export type ContentRenderWarmup = (db: Database, og: OgWarmTarget) => void

// Unwired default: a publish path that never loaded the render stack
// simply skips the warm.
let impl: ContentRenderWarmup = () => undefined

export function wireContentRenderWarmup(next: ContentRenderWarmup): void {
  impl = next
}

/** Fire-and-forget pre-warm of the OG + calendar buckets (see the seam note above). */
export function warmContentRenderCaches(db: Database, og: OgWarmTarget): void {
  impl(db, og)
}

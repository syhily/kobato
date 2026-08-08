import type { Database } from '@/server/infra/db/database'

/**
 * The OG render inputs the request path folds into its cache key — the
 * warm target must carry exactly what the OG route passes to `through()`.
 */
export interface OgWarmTarget {
  slug: string
  title: string
  summary: string
  cover: string
}

/**
 * Render-cache warmup seam: the content domain owns the WHEN, the render
 * layer the HOW. Wired at import time by `@/server/render/warmup/content-cache` —
 * the layer graph stays one-way (infra → domains → render → http).
 */
export type ContentRenderWarmup = (db: Database, og: OgWarmTarget) => void

let impl: ContentRenderWarmup = () => undefined

export function wireContentRenderWarmup(next: ContentRenderWarmup): void {
  impl = next
}

/** Fire-and-forget pre-warm of the OG + calendar buckets. */
export function warmContentRenderCaches(db: Database, og: OgWarmTarget): void {
  impl(db, og)
}

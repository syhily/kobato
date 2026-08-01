import { format } from 'date-fns'

import type { Database } from '@/server/infra/db/database'

import { type OgWarmTarget, wireContentRenderWarmup } from '@/server/domains/content/render-warmup'
import { through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { renderCalendar } from '@/server/render/calendar/render'
import { drawOpenGraph } from '@/server/render/og/render'

const log = getLogger('render.warmup')

/**
 * The render-layer half of the content warmup seam
 * (`domains/content/render-warmup.ts`): pre-warm the buckets a crawler's
 * first scan hits right after content goes out — the entity's OG card
 * and today's sidebar calendar (both themes). Each warm goes through the
 * SAME `through(...)` call the HTTP resources make, so the bucket fills
 * under the request path's own key and the first crawler hit reads
 * instead of rendering. Failures are logged and swallowed — a cold cache
 * must never reach the publish/mutation that triggered the warm.
 */
function warmContentCaches(db: Database, og: OgWarmTarget): void {
  void through(db, 'og', og, () => drawOpenGraph(og)).catch((err: unknown) => {
    log.warn('OG render warmup failed', {
      slug: og.slug,
      err: err instanceof Error ? err.message : String(err),
    })
  })

  const today = new Date()
  for (const theme of ['light', 'dark'] as const) {
    const date = format(today, 'yyyy-MM-dd')
    void through(db, 'calendar', { date, theme }, () => renderCalendar(today, theme)).catch((err: unknown) => {
      log.warn('calendar render warmup failed', {
        date,
        theme,
        err: err instanceof Error ? err.message : String(err),
      })
    })
  }
}

// Self-wire into the content domain's slot at import time. This module
// loads with the OG/calendar request-path owner (`http/resources/images.ts`).
wireContentRenderWarmup(warmContentCaches)

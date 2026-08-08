import { format } from 'date-fns'

import type { Database } from '@/server/infra/db/database'

import { type OgWarmTarget, wireContentRenderWarmup } from '@/server/domains/content/render-warmup'
import { through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { renderCalendar } from '@/server/render/calendar/render'
import { drawOpenGraph } from '@/server/render/og/render'

const log = getLogger('render.warmup')

/**
 * Render-layer half of the content warmup seam: pre-warm the OG card and
 * today's calendar (both themes) through the same `through(...)` key the
 * HTTP resources use. Failures are logged and swallowed.
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

// Self-wires into the content domain's warmup slot at import time.
wireContentRenderWarmup(warmContentCaches)

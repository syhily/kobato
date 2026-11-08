import { format } from 'date-fns'

import type { Database } from '@/server/infra/db/database'

import { type OgWarmTarget, wireContentRenderWarmup } from '@/server/domains/content/render-warmup'
import { through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { renderCalendar } from '@/server/render/calendar/render'
import { drawOpenGraph } from '@/server/render/og/render'
import { getBlogSettingsSnapshotSync } from '@/shared/config/getters'
import { APP_VERSION } from '@/shared/config/version'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'

const log = getLogger('render.warmup')

/**
 * Render-layer half of the content warmup seam: pre-warm the OG card and
 * today's calendar (both themes) through the same `through(...)` key the
 * HTTP resources use. Failures are logged and swallowed.
 */
function warmContentCaches(db: Database, og: OgWarmTarget): void {
  // The request path keys by the REQUEST capture; the warmup has no request, so
  // it resolves TODAY'S snapshot once and keys + renders from that same capture
  // (OG cards include settings-derived identity/SEO, so they carry it too).
  const snapshot = getBlogSettingsSnapshotSync()
  const localization = resolveAppLocalization(snapshot)

  void through(db, 'og', { ...og, settingsRevision: localization.revisions.og }, () =>
    drawOpenGraph(og, snapshot.bundle),
  ).catch((err: unknown) => {
    log.warn('OG render warmup failed', {
      slug: og.slug,
      err: err instanceof Error ? err.message : String(err),
    })
  })

  const today = new Date()
  for (const theme of ['light', 'dark'] as const) {
    const date = format(today, 'yyyy-MM-dd')
    void through(
      db,
      'calendar',
      {
        date,
        theme,
        locale: localization.locale,
        version: APP_VERSION,
        settingsRevision: localization.revisions.calendar,
      },
      () => renderCalendar(today, theme, localization.locale, snapshot.bundle),
    ).catch((err: unknown) => {
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

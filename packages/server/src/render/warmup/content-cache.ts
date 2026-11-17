import { getBlogSettingsSnapshotSync } from '@kobato/shared/config/getters.ts'
import { APP_VERSION } from '@kobato/shared/config/version.ts'
import { resolveAppLocalization } from '@kobato/shared/i18n/app-localization.ts'
import { format } from 'date-fns'

import { type OgWarmTarget, wireContentRenderWarmup } from '../../domains/content/render-warmup'
import { through } from '../../infra/cache/registry'
import { getLogger } from '../../infra/logger'
import { renderCalendar } from '../calendar/render'
import { drawOpenGraph } from '../og/render'

const log = getLogger('render.warmup')

/**
 * Render-layer half of the content warmup seam: pre-warm the OG card and
 * today's calendar (both themes) through the same `through(...)` key the
 * HTTP resources use. Failures are logged and swallowed.
 */
function warmContentCaches(og: OgWarmTarget): void {
  // The request path keys by the REQUEST capture; the warmup has no request, so
  // it resolves TODAY'S snapshot once and keys + renders from that same capture
  // (OG cards include settings-derived identity/SEO, so they carry it too).
  const snapshot = getBlogSettingsSnapshotSync()
  const localization = resolveAppLocalization(snapshot)

  void through('og', { ...og, settingsRevision: localization.revisions.og }, () =>
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

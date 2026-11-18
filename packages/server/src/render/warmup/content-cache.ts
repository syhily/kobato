import { APP_VERSION } from '@kobato/distribution/app.ts'
import { type OgWarmTarget, wireContentRenderWarmup } from '@kobato/server/domains/content/render-warmup.ts'
import { through } from '@kobato/server/infra/cache/registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { renderCalendar } from '@kobato/server/render/calendar/render.ts'
import { drawOpenGraph } from '@kobato/server/render/og/render.ts'
import { resolveAppLocalization } from '@kobato/settings/app-localization.ts'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters.ts'
import { format } from 'date-fns'

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

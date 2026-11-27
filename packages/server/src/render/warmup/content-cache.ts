import { APP_VERSION } from '@kobato/base/distribution/app'
import { type OgWarmTarget, wireContentRenderWarmup } from '@kobato/server/domains/content/render-warmup'
import { through } from '@kobato/server/infra/cache/registry'
import { getLogger } from '@kobato/server/infra/logger'
import { renderCalendar } from '@kobato/server/render/calendar/render'
import { drawOpenGraph } from '@kobato/server/render/og/render'
import { resolveAppLocalization } from '@kobato/settings/app-localization'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters'
import { format } from 'date-fns'

const log = getLogger('render.warmup')

function warmContentCaches(og: OgWarmTarget): void {
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

wireContentRenderWarmup(warmContentCaches)

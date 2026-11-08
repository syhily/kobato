import type { SidebarSelection } from '@/server/domains/posts/services/featured'
import type { SidebarSettings } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'
import type { ClientTag } from '@/shared/types/catalog'

import { getSidebarWidgetCount } from '@/shared/config/utils'
import { formatLocalDate } from '@/shared/utils/formatter'
import { sampleSize } from '@/shared/utils/tools'

export interface SidebarSeedInput {
  /** Entity/URL scope: `post:<id>`, `page:<id>`, `home`. */
  scope: string
  /** Site calendar date (`yyyy-MM-dd`) in the request's time zone. */
  date: string
  /** Settings snapshot revision. */
  revision: string
}

/**
 * The deterministic rotation bucket for the sidebar widgets: one selection per
 * (scope, site calendar day, settings revision). Never a per-request CSPRNG
 * draw — that would make the detail payload (and its ETag) change on every
 * render while the product intent is only "rotate the random widgets".
 */
export function sidebarSelectionSeed({ scope, date, revision }: SidebarSeedInput): string {
  return `sidebar\u0000${scope}\u0000${date}\u0000${revision}`
}

/**
 * Build the shared selection for ONE representation. The controller computes it
 * once per request and hands the same object to every sidebar selector, so the
 * post and tag widgets can never disagree about the day/scope/revision.
 */
export function sidebarSelection({
  settings,
  scope,
  now,
  localization,
}: {
  settings: SidebarSettings
  scope: string
  now: Date
  localization: AppLocalization
}): SidebarSelection {
  return {
    settings,
    seed: sidebarSelectionSeed({
      scope,
      // `yyyy-MM-dd` in the SITE time zone (explicit tokens override the
      // user-configured display format).
      date: formatLocalDate(now, 'yyyy-MM-dd', localization),
      revision: localization.revisions.listing,
    }),
  }
}

export function selectSidebarTags(tags: ClientTag[], selection: SidebarSelection): ClientTag[] {
  const randomSize = getSidebarWidgetCount(selection.settings, 'randomTags')
  if (randomSize <= 0) {
    return []
  }
  const topTags = tags
    .slice()
    .sort((a, b) => b.counts - a.counts)
    .slice(0, randomSize * 2)
  if (topTags.length <= randomSize) {
    return topTags
  }

  return sampleSize(topTags, randomSize, `${selection.seed}|tags|${topTags.length}`)
}

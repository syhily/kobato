import type { ClientTag } from '@kobato/catalog/model'
import type { SidebarSelection } from '@kobato/server/domains/posts/services/featured'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { SidebarSettings } from '@kobato/settings/types'

import { getSidebarWidgetCount } from '@kobato/settings/presentation'
import { sampleSize } from '@kobato/utils/sampling'
import { formatLocalDate } from '@kobato/utils/site-date'

export interface SidebarSeedInput {
  scope: string
  date: string
  revision: string
}

export function sidebarSelectionSeed({ scope, date, revision }: SidebarSeedInput): string {
  return `sidebar\u0000${scope}\u0000${date}\u0000${revision}`
}

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

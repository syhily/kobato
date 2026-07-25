import type { ClientTag } from '@/shared/types/catalog'

import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import { sampleSize } from '@/shared/utils/tools'

export function selectSidebarTags(tags: ClientTag[]): ClientTag[] {
  const randomSize = getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'randomTags')
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

  return sampleSize(topTags, randomSize)
}

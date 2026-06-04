import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ClientTag, SidebarPostLink } from '@/shared/types/catalog'

import { selectSidebarPosts as querySidebarPosts } from '@/server/domains/posts/repos/public-query/featured'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import { sampleSize } from '@/shared/utils/tools'

export async function selectSidebarPosts(db: NodePgDatabase, count: number): Promise<SidebarPostLink[]> {
  return querySidebarPosts(db, count)
}

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

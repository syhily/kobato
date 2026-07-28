import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'

import { userSession } from '@/server/domains/auth/primitives'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { isSidebarWidgetEnabled } from '@/shared/config/utils'

export async function loadSidebarData(db: Database, session: BlogSession) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar')
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db) : []

  return { admin, recentComments }
}

import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { Database } from '@kobato/server/infra/db/database'

import { userSession } from '@kobato/server/domains/auth/primitives'
import { latestComments } from '@kobato/server/domains/comments/services/public-query'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { isSidebarWidgetEnabled } from '@kobato/shared/config/utils'

export async function loadSidebarData(db: Database, session: BlogSession) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar')
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db) : []

  return { admin, recentComments }
}

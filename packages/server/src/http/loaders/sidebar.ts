import type { Database } from '@kobato/db/sqlite/database'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { userSession } from '@kobato/server/domains/auth/primitives'
import { latestComments } from '@kobato/server/domains/comments/services/public-query'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { isSidebarWidgetEnabled } from '@kobato/settings/presentation'

export async function loadSidebarData(db: Database, session: BlogSession, settings: BlogSettingsBundle | null) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar', settings)
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db, settings) : []

  return { admin, recentComments }
}

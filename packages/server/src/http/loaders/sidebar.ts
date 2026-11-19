import type { Database } from '@kobato/db/database.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { userSession } from '@kobato/server/domains/auth/primitives.ts'
import { latestComments } from '@kobato/server/domains/comments/services/public-query.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { isSidebarWidgetEnabled } from '@kobato/settings/presentation.ts'

export async function loadSidebarData(db: Database, session: BlogSession, settings: BlogSettingsBundle | null) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar', settings)
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db, settings) : []

  return { admin, recentComments }
}

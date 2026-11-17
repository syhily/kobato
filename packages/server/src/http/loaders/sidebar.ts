import type { Database } from '@kobato/db/database.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'

import { userSession } from '@kobato/server/domains/auth/primitives.ts'
import { latestComments } from '@kobato/server/domains/comments/services/public-query.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { isSidebarWidgetEnabled } from '@kobato/shared/config/utils.ts'

/**
 * `settings` is the request-pinned snapshot (HandlerContext.settings) —
 * required, never the global snapshot.
 */
export async function loadSidebarData(db: Database, session: BlogSession, settings: BlogSettingsBundle | null) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar', settings)
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db, settings) : []

  return { admin, recentComments }
}

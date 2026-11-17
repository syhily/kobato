import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'

import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { isSidebarWidgetEnabled } from '@kobato/shared/config/utils.ts'

import type { BlogSession } from '../../domains/auth/session-storage'
import type { Database } from '../../infra/db/database'

import { userSession } from '../../domains/auth/primitives'
import { latestComments } from '../../domains/comments/services/public-query'

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

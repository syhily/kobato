import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { userSession } from '@/server/domains/auth/primitives'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { isSidebarWidgetEnabled } from '@/shared/config/utils'

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

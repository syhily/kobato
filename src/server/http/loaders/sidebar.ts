import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { userSession } from '@/server/domains/auth/primitives'
import { latestComments } from '@/server/domains/comments/services/public-query'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { isSidebarWidgetEnabled } from '@/shared/config/utils'

export async function loadSidebarData(db: NodePgDatabase, session: BlogSession) {
  const admin = userSession(session)?.role === 'admin'
  const sidebar = requireBlogSettingsSection('sidebar')
  const recentComments = isSidebarWidgetEnabled(sidebar, 'recentComments') ? await latestComments(db) : []

  return { admin, recentComments }
}

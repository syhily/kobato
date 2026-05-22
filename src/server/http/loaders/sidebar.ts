import type { BlogSession } from '@/server/domains/auth/session-storage'

import { userSession } from '@/server/domains/auth/primitives'
import { latestComments } from '@/server/domains/comments/services/public-query'

export async function loadSidebarData(session: BlogSession) {
  const admin = userSession(session)?.role === 'admin'
  const recentComments = await latestComments()

  return { admin, recentComments }
}

import type { LoaderFunctionArgs } from 'react-router'

import type { AnalyticsOverviewData } from '@/server/domains/analytics/services/overview'
import type { AdminPostDto } from '@/shared/contracts/posts'

import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { loadAnalyticsOverview } from '@/server/domains/analytics/services/overview'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'
import { requireRole } from '@/server/domains/auth/rbac'
import { toAdminPostDto } from '@/server/domains/posts/projection'
import { findPostMetaById } from '@/server/domains/posts/services/single'
import { getRequestContext } from '@/server/http/request-context'
import { findTagNamesByPostId } from '@/server/infra/db/operations/post-tag'

export interface PostAnalyticsData extends AnalyticsOverviewData {
  post: AdminPostDto
}

// Single implementation behind both per-post analytics routes
// (/admin/posts/:postId/analytics and /editor/post/:id/analytics). The
// route modules only map their route param onto `postId`; new metric
// groups land in the domain's `loadAnalyticsOverview` once.
export async function loadPostAnalyticsData({
  request,
  context,
  postId,
}: Pick<LoaderFunctionArgs, 'request' | 'context'> & { postId: number }): Promise<PostAnalyticsData> {
  const ctx = getRequestContext({ request, context })
  requireRole({ user: ctx.viewer ?? undefined, role: ctx.viewer?.role ?? null }, 'author')

  const db = ctx.db

  const meta = findPostMetaById(db, postId)
  if (meta === null) {
    throw new Response('文章不存在', { status: 404 })
  }
  const tags = await findTagNamesByPostId(db, postId)
  const post = toAdminPostDto(meta, { tags })

  const url = new URL(request.url)
  const input = parseAnalyticsSearch(url.searchParams)

  const overview = await loadAnalyticsOverview(getAnalyticsReader(), {
    ...input,
    entityType: 'post',
    entityId: postId,
  })

  return { post, ...overview }
}

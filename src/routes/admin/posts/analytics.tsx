import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller, isOrpcNotFound } from '@/server/http/ssr-caller'
import { notFound } from '@/server/infra/http/status'
import { titleMeta } from '@/shared/seo/title-meta'
import { idFromString } from '@/shared/utils/id'
import { PostAnalyticsHeader, PostAnalyticsView } from '@/ui/admin/analytics/PostAnalyticsView'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'author')
  const url = new URL(request.url)
  const postId = idFromString(params.postId)
  try {
    return await caller.admin.posts.analytics({ postId, search: url.searchParams.toString() })
  } catch (error) {
    // The procedure answers NOT_FOUND for a missing post meta — translate it back to the historical 404 Response.
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
}

export const meta = titleMeta('文章分析')

export default function PostAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { post, counters, initialMetrics } = loaderData
  const state = useAnalyticsState()

  return (
    <div className="flex flex-col gap-4">
      <PostAnalyticsHeader post={post} />
      <PostAnalyticsView post={post} state={state} counters={counters} initialMetrics={initialMetrics} />
    </div>
  )
}

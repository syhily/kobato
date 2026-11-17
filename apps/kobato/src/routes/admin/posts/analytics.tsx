import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller, isOrpcNotFound } from '@kobato/server/http/ssr-caller.ts'
import { notFound } from '@kobato/server/infra/http/status.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'
import { PostAnalyticsHeader, PostAnalyticsView } from '@kobato/web/ui/admin/analytics/PostAnalyticsView.tsx'
import { useAnalyticsState } from '@kobato/web/ui/admin/analytics/use-analytics-state.ts'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'author')
  const url = new URL(request.url)
  const postId = idFromString(params.postId)
  try {
    return await caller.admin.posts.analytics({ postId, search: url.searchParams.toString() })
  } catch (error) {
    // The procedure answers NOT_FOUND for a missing post meta — translate it back to a 404 Response.
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
}

export const meta = titleMeta('meta.title.admin.postAnalytics')

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

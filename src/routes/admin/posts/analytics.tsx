import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller, isOrpcNotFound } from '@/server/http/ssr-caller'
import { notFound } from '@/server/infra/http/status'
import { idFromString } from '@/shared/utils/id'
import { PostAnalyticsHeader, PostAnalyticsView } from '@/ui/admin/analytics/PostAnalyticsView'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole({ user: viewer ?? undefined, role: viewer?.role ?? null }, 'author')
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

export default function PostAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { post, counters, views, heatmap, initialMetrics } = loaderData

  return (
    <div className="flex flex-col gap-4">
      <PostAnalyticsHeader post={post} />
      <PostAnalyticsView
        post={post}
        counters={counters}
        views={views}
        heatmap={heatmap}
        initialMetrics={initialMetrics}
      />
    </div>
  )
}

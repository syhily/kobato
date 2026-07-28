import { loadPostAnalyticsData } from '@/server/http/loaders/post-analytics'
import { idFromString } from '@/shared/utils/id'
import { PostAnalyticsHeader, PostAnalyticsView } from '@/ui/admin/analytics/PostAnalyticsView'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  return loadPostAnalyticsData({ request, context, postId: idFromString(params.postId) })
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

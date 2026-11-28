import { orpc } from '@kobato/api/browser/client'
import { idFromString } from '@kobato/base/utils/id'

import { isOrpcErrorWithCode } from '@/lib/orpc-error'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { notFound } from '@/lib/route-status'
import { titleMeta } from '@/seo/title-meta'
import { PostAnalyticsHeader, PostAnalyticsView } from '@/ui/analytics/PostAnalyticsView'
import { useAnalyticsState } from '@/ui/analytics/use-analytics-state'

import type { Route } from './+types/analytics'

export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'author', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  const postId = idFromString(params.postId)
  try {
    return await orpc.admin.posts.analytics({ postId, search: url.searchParams.toString() })
  } catch (error) {
    if (isOrpcErrorWithCode(error, 'NOT_FOUND')) {
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

import { Link } from 'react-router'

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
  const postId = idFromString(params.id)
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

export default function EditorPostAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { post, counters, views, heatmap, initialMetrics } = loaderData

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <PostAnalyticsHeader post={post} />
        <Link
          to={`/editor/post/${post.id}`}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          返回编辑器
        </Link>
      </div>

      <div className="mb-4 flex border-b">
        <Link
          to={`/editor/post/${post.id}`}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          编辑
        </Link>
        <Link
          to={`/editor/post/${post.id}/analytics`}
          className="border-b-2 border-foreground px-4 py-2 text-sm font-medium text-foreground"
        >
          分析
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <PostAnalyticsView
          post={post}
          counters={counters}
          views={views}
          heatmap={heatmap}
          initialMetrics={initialMetrics}
        />
      </div>
    </div>
  )
}

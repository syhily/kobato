import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller, isOrpcNotFound } from '@kobato/server/http/ssr-caller.ts'
import { notFound } from '@kobato/server/infra/http/status.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { idFromString } from '@kobato/utils/id.ts'
import { PostAnalyticsHeader, PostAnalyticsView } from '@kobato/web/ui/admin/analytics/PostAnalyticsView.tsx'
import { useAnalyticsState } from '@kobato/web/ui/admin/analytics/use-analytics-state.ts'
import { Link } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

import type { Route } from './+types/analytics'

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'author')
  const url = new URL(request.url)
  const postId = idFromString(params.id)
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

export default function EditorPostAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  const { post, counters, initialMetrics } = loaderData
  const state = useAnalyticsState()

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <PostAnalyticsHeader post={post} />
        <Link
          to={`/editor/post/${post.id}`}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {t('admin.editor.analytics.back')}
        </Link>
      </div>

      <div className="mb-4 flex border-b">
        <Link
          to={`/editor/post/${post.id}`}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {t('admin.editor.analytics.edit')}
        </Link>
        <Link
          to={`/editor/post/${post.id}/analytics`}
          className="border-b-2 border-foreground px-4 py-2 text-sm font-medium text-foreground"
        >
          {t('admin.editor.analytics.analytics')}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <PostAnalyticsView post={post} state={state} counters={counters} initialMetrics={initialMetrics} />
      </div>
    </div>
  )
}

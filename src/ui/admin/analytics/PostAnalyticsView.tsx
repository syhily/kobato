import { Link } from 'react-router'

import type { AdminPostDto } from '@/shared/contracts/posts'

import { idFromString } from '@/shared/utils/id'
import { AnalyticsDashboard, type AnalyticsDashboardData } from '@/ui/admin/analytics/AnalyticsDashboard'
import { ExportButton } from '@/ui/admin/analytics/ExportButton'
import { type AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

// Title + public-link header shared by both shells; each route wraps it in its own chrome.
export function PostAnalyticsHeader({ post }: { post: AdminPostDto }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">文章分析</h1>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{post.title}</span>
        <span className="text-border">·</span>
        <Link to={`/posts/${post.slug}`} target="_blank" className="hover:underline">
          /posts/{post.slug}
        </Link>
      </div>
    </div>
  )
}

export interface PostAnalyticsViewProps extends AnalyticsDashboardData {
  post: AdminPostDto
  state: AnalyticsState
}

// The per-post dashboard reuses the site-wide composition scoped by
// entityType/entityId — every query (counters, views, heatmap, metrics,
// map, export) carries the entity filter. `post.id` is the wire idString;
// the scope keeps the numeric domain id, converted once here at the boundary.
export function PostAnalyticsView({ post, state, counters, initialMetrics }: PostAnalyticsViewProps) {
  const scope = { entityType: 'post' as const, entityId: idFromString(post.id) }
  return (
    <>
      <div className="flex justify-end">
        <ExportButton state={state} scope={scope} />
      </div>
      <AnalyticsDashboard data={{ counters, initialMetrics }} state={state} scope={scope} />
    </>
  )
}

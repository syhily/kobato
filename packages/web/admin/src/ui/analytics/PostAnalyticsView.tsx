import type { AdminPostDto } from '@kobato/contracts/posts.ts'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { idFromString } from '@kobato/utils/id.ts'
import { AnalyticsDashboard, type AnalyticsDashboardData } from '@kobato/web-admin/ui/analytics/AnalyticsDashboard.tsx'
import { ExportButton } from '@kobato/web-admin/ui/analytics/ExportButton.tsx'
import { type AnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state.ts'
import { Link } from 'react-router'

// Title + public-link header shared by both shells; each route wraps it in its own chrome.
export function PostAnalyticsHeader({ post }: { post: AdminPostDto }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">{t('admin.analytics.post.title')}</h1>
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

// The per-post dashboard: the site-wide composition scoped by entityType/entityId.
// `post.id` is the wire idString; the scope keeps the numeric domain id, converted once here.
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

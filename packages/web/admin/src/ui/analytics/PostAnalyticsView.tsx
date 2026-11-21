import type { AdminPostDto } from '@kobato/api/contracts/posts'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { idFromString } from '@kobato/utils/id'
import { AnalyticsDashboard, type AnalyticsDashboardData } from '@kobato/web-admin/ui/analytics/AnalyticsDashboard'
import { type AnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state'
import { Link } from 'react-router'

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

export function PostAnalyticsView({ post, state, counters, initialMetrics }: PostAnalyticsViewProps) {
  const scope = { entityType: 'post' as const, entityId: idFromString(post.id) }
  return <AnalyticsDashboard data={{ counters, initialMetrics }} state={state} scope={scope} />
}

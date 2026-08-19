import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { Card, CardContent } from '@/ui/components/card'

import type { Route } from './+types/mentions'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'admin')

  const url = new URL(request.url)
  return caller.analytics.mentions({ search: url.searchParams.toString() })
}

export default function MentionsPage({ loaderData }: Route.ComponentProps) {
  const { referers } = loaderData
  const state = useAnalyticsState()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">反向链接</h1>
        <p className="text-sm text-muted-foreground">追踪来自其他网站的外部链接</p>
      </div>

      <Card className="px-4 py-3 shadow-none">
        <DateRangePicker preset={state.preset} onSelect={state.setPreset} />
      </Card>

      <Card className="gap-2 shadow-none">
        <CardContent className="px-4 pb-4">
          {referers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">当前时间范围内暂无数据</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {referers.map((row) => (
                <li key={row.name} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/60">
                  <span className="flex-1 truncate font-medium">
                    {row.name === '' || row.name === 'direct' ? (
                      <span className="text-muted-foreground">直接访问</span>
                    ) : (
                      <a
                        href={`https://${row.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {row.name}
                      </a>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.visits.toLocaleString()} 次访问
                  </span>
                  <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                    ({row.visitors.toLocaleString()} 访客)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { orpc } from '@kobato/api/browser/client'
import { Card, CardContent } from '@kobato/ui/components/card'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { formatNumber } from '@kobato/utils/format'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { DateRangePicker } from '@kobato/web-admin/ui/analytics/DateRangePicker'
import { useAnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state'

import type { Route } from './+types/mentions'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  return orpc.admin.analytics.mentions({ search: url.searchParams.toString() })
}

export default function MentionsPage({ loaderData }: Route.ComponentProps) {
  const { locale, t } = useI18n()
  const { referers } = loaderData
  const state = useAnalyticsState()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t('admin.analytics.mentions.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.analytics.mentions.description')}</p>
      </div>

      <Card className="px-4 py-3 shadow-none">
        <DateRangePicker
          preset={state.preset}
          range={state.range}
          onSelect={state.setPreset}
          onSelectRange={state.setRange}
        />
      </Card>

      <Card className="gap-2 shadow-none">
        <CardContent className="px-4 pb-4">
          {referers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('admin.analytics.empty')}</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {referers.map((row) => (
                <li key={row.name} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/60">
                  <span className="flex-1 truncate font-medium">
                    {row.name === '' || row.name === 'direct' ? (
                      <span className="text-muted-foreground">{t('admin.analytics.direct')}</span>
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
                    {t('admin.analytics.visitsSuffix', { count: formatNumber(row.visits, { locale }) })}
                  </span>
                  <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                    {t('admin.analytics.visitorsParen', { count: formatNumber(row.visitors, { locale }) })}
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

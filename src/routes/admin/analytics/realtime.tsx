import { guardOnlyLoader } from '@/server/http/request-context'
import { RealtimeFeed } from '@/ui/admin/analytics/RealtimeFeed'
import { useI18n } from '@/ui/lib/I18nProvider'

export const loader = guardOnlyLoader('admin')

export default function WpAdminAnalyticsRealtime() {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RealtimeFeed />
      <div className="rounded-xl border bg-card px-6 py-8 text-sm text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">{t('admin.analytics.realtime.tipTitle')}</h2>
        <p className="mt-2 leading-relaxed">{t('admin.analytics.realtime.tipBody')}</p>
        <p className="mt-3 leading-relaxed">{t('admin.analytics.realtime.tipAdmin')}</p>
      </div>
    </div>
  )
}

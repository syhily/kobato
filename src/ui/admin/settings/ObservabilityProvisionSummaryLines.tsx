import type { ObservabilityProvisionSummary } from '@/shared/contracts/observability'

import { useI18n } from '@/ui/lib/I18nProvider'

// Provision result lines shared by the connection test (its automatic asset
// sync) and the assets card's manual resync — one rendering, no drifting copy.
export function ObservabilityProvisionSummaryLines({ summary }: { summary: ObservabilityProvisionSummary }) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p>{t('admin.settings.observability.assets.dashboardsSynced', { dashboards: summary.dashboards })}</p>
      <p>
        {t(
          summary.organization === 'created'
            ? 'admin.settings.observability.assets.organizationCreated'
            : 'admin.settings.observability.assets.organizationExists',
        )}
      </p>
      <p>
        {t(
          summary.rumToken === 'created'
            ? 'admin.settings.observability.assets.rumTokenCreated'
            : 'admin.settings.observability.assets.rumTokenExists',
        )}
      </p>
      <p>{t('admin.settings.observability.assets.pipelineInstalled')}</p>
    </div>
  )
}

import type { ObservabilityProvisionSummary } from '@kobato/contracts/observability.ts'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'

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

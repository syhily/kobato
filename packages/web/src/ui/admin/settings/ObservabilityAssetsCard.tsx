import type {
  ObservabilityProvisionSummary,
  ObservabilityStatusOutput,
} from '@kobato/shared/contracts/observability.ts'

import { Button } from '@kobato/ui/components/button.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { onMutationError } from '@kobato/web/client/lib/toast-api-error.ts'
import { ObservabilityProvisionSummaryLines } from '@kobato/web/ui/admin/settings/ObservabilityProvisionSummaryLines.tsx'
import { SettingsRow } from '@kobato/web/ui/admin/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web/ui/admin/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web/ui/admin/settings/shell/SettingGroupContent.tsx'
import { useMutation } from '@tanstack/react-query'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'

interface ObservabilityAssetsCardProps {
  status: ObservabilityStatusOutput | undefined
  /** Last-4 mask of the stored RUM token — display only, never editable here. */
  rumClientTokenMask: string | null
  onStatusInvalidated: () => void
}

export function ObservabilityAssetsCard({
  status,
  rumClientTokenMask,
  onStatusInvalidated,
}: ObservabilityAssetsCardProps) {
  const { t } = useI18n()
  const [summary, setSummary] = useState<ObservabilityProvisionSummary | null>(null)

  const provisionMutation = useMutation({
    ...orpcQuery.admin.observability.provision.mutationOptions(),
    onSuccess: (result) => {
      setSummary(result)
      onStatusInvalidated()
    },
    onError: onMutationError('admin.settings.observability.assets.provisionFailed', t),
  })

  const verified = status?.verified === true
  const stateLabel =
    status === undefined
      ? t('admin.settings.observability.assets.statusLoading')
      : status.provisioned
        ? t('admin.settings.observability.assets.provisioned')
        : t('admin.settings.observability.assets.notProvisioned')
  const outdated = status !== undefined && status.provisioned && !status.provisionedCurrent
  const current = status !== undefined && status.provisioned && status.provisionedCurrent

  return (
    <SettingGroup
      title={t('admin.settings.observability.assets.title')}
      description={t('admin.settings.observability.assets.description')}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.observability.assets.state')}
          hint={t('admin.settings.observability.assets.includes')}
        >
          <div className="flex flex-col gap-1 text-sm">
            <p>{stateLabel}</p>
            {current ? (
              <p className="text-status-success-fg">{t('admin.settings.observability.assets.current')}</p>
            ) : null}
            {outdated ? (
              <p className="text-status-warn-fg">{t('admin.settings.observability.assets.outdated')}</p>
            ) : null}
          </div>
        </SettingsRow>

        <SettingsRow
          label={t('admin.settings.observability.assets.token')}
          hint={t('admin.settings.observability.assets.tokenHint')}
          labelTooltip={t('admin.settings.observability.tooltip.token')}
        >
          <code className="block w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all select-all">
            {rumClientTokenMask === null
              ? t('admin.settings.observability.assets.tokenMissing')
              : t('admin.settings.observability.assets.tokenConfigured', { mask: rumClientTokenMask })}
          </code>
        </SettingsRow>

        <SettingsRow
          label={t('admin.settings.observability.assets.resync')}
          hint={t('admin.settings.observability.assets.resyncHint')}
        >
          <div className="flex flex-col gap-3">
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!verified || provisionMutation.isPending}
                onClick={() => provisionMutation.mutate({})}
              >
                <RefreshCwIcon data-icon="sm" />
                {provisionMutation.isPending
                  ? t('admin.settings.observability.assets.resyncing')
                  : t('admin.settings.observability.assets.resync')}
              </Button>
            </div>
            {summary !== null ? (
              <div role="status">
                <ObservabilityProvisionSummaryLines summary={summary} />
              </div>
            ) : null}
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

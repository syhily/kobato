import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { isStorageMigrationInFlightPhase } from '@/shared/contracts/storage'
import { formatBytes } from '@/shared/i18n/format'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

const PHASE_LABEL: Record<string, UiMessageId> = {
  copying: 'admin.settings.storage.migration.phase.copying',
  switching: 'admin.settings.storage.migration.phase.switching',
  'catching-up': 'admin.settings.storage.migration.phase.catchingUp',
  completed: 'admin.settings.storage.migration.phase.completed',
  failed: 'admin.settings.storage.migration.phase.failed',
  cancelled: 'admin.settings.storage.migration.phase.cancelled',
  interrupted: 'admin.settings.storage.migration.phase.interrupted',
}

const DIRECTION_LABEL: Record<string, UiMessageId> = {
  'local-to-s3': 'admin.settings.storage.migration.directionLabel.localToS3',
  's3-to-s3': 'admin.settings.storage.migration.directionLabel.s3ToS3',
  's3-to-local': 'admin.settings.storage.migration.directionLabel.s3ToLocal',
}

// Migration status + control. Not a settings form (no useSettingsCard): the
// migration task flips the storage config server-side, so completion
// revalidates the route loader to re-seed the sibling cards' source.
export function StorageMigrationCard() {
  const queryClient = useQueryClient()
  const revalidator = useRevalidator()
  const { locale, t } = useI18n()
  const { data: status } = useQuery(
    orpcQuery.admin.storage.migrationStatus.queryOptions({
      input: {},
      refetchInterval: (query) => {
        const phase = query.state.data?.phase
        return phase !== undefined && isStorageMigrationInFlightPhase(phase) ? 1500 : false
      },
    }),
  )

  // One-shot completion notice + stats refresh + route-loader revalidation
  // (the flipped storage config / status card re-seed from the loader data).
  const completedRef = useRef<string | null>(null)
  useEffect(() => {
    if (status?.phase !== 'completed' || status.finishedAt === null) {
      return
    }
    if (completedRef.current === status.finishedAt) {
      return
    }
    completedRef.current = status.finishedAt
    toast.success(t('admin.settings.storage.migration.toastCompleted'), {
      description: t('admin.settings.storage.migration.toastCompletedDescription', {
        copied: status.copiedObjects,
        bytes: formatBytes(status.copiedBytes, { locale }),
        skipped: status.skippedObjects,
      }),
    })
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.stats.key() })
    void revalidator.revalidate()
  }, [status, queryClient, revalidator, locale, t])

  if (status == null || status.phase === 'idle') {
    return null
  }

  const inFlight = isStorageMigrationInFlightPhase(status.phase)
  const resumable = status.phase === 'failed' || status.phase === 'cancelled' || status.phase === 'interrupted'

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.migrationStatus.key() })

  const handleCancel = async () => {
    try {
      await orpc.admin.storage.cancelMigration({})
      await invalidateStatus()
    } catch (error) {
      toastApiError(error, 'admin.toast.migrationCancelFailed', t)
    }
  }

  const handleResume = async () => {
    try {
      await orpc.admin.storage.resumeMigration({})
      await invalidateStatus()
    } catch (error) {
      toastApiError(error, 'admin.toast.migrationResumeFailed', t)
    }
  }

  return (
    <SettingGroup
      title={t('admin.settings.storage.migration.title')}
      description={t('admin.settings.storage.migration.description')}
      actions={
        inFlight ? (
          <Button variant="outline" size="sm" onClick={() => void handleCancel()}>
            {t('admin.settings.storage.migration.cancel')}
          </Button>
        ) : resumable ? (
          <Button variant="outline" size="sm" onClick={() => void handleResume()}>
            {t('admin.settings.storage.migration.resume')}
          </Button>
        ) : null
      }
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.storage.migration.direction')}>
          <p className="text-sm">
            {status.direction !== null ? t(DIRECTION_LABEL[status.direction] ?? status.direction) : '—'}
            {status.target !== null && (
              <span className="ml-2 text-muted-foreground">
                {status.target.bucket} · {status.target.endpoint}
              </span>
            )}
          </p>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.storage.migration.status')}>
          <p className="flex items-center gap-2 text-sm">
            {inFlight && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
            {t(PHASE_LABEL[status.phase] ?? status.phase)}
          </p>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.storage.migration.progress')}>
          <p className="text-sm text-muted-foreground">
            {t('admin.settings.storage.migration.copiedSummary', {
              copied: status.copiedObjects,
              bytes: formatBytes(status.copiedBytes, { locale }),
              skipped: status.skippedObjects,
            })}
          </p>
        </SettingsRow>
        {status.verification !== null && (
          <SettingsRow label={t('admin.settings.storage.migration.verification')}>
            {status.verification.matches ? (
              <p className="text-sm text-muted-foreground">
                {t('admin.settings.storage.migration.verificationMatch', {
                  sourceCount: status.verification.sourceCount,
                  sourceBytes: formatBytes(status.verification.sourceBytes, { locale }),
                  targetCount: status.verification.targetCount,
                  targetBytes: formatBytes(status.verification.targetBytes, { locale }),
                })}
              </p>
            ) : (
              <p className="text-sm text-destructive">
                {t('admin.settings.storage.migration.verificationMismatch', {
                  sourceCount: status.verification.sourceCount,
                  sourceBytes: formatBytes(status.verification.sourceBytes, { locale }),
                  targetCount: status.verification.targetCount,
                  targetBytes: formatBytes(status.verification.targetBytes, { locale }),
                })}
              </p>
            )}
          </SettingsRow>
        )}
        {status.error !== null && (
          <SettingsRow label={t('admin.settings.storage.migration.error')}>
            <p className="text-sm text-destructive">{status.error}</p>
          </SettingsRow>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}

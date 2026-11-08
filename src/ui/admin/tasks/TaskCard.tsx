import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { JobSummaryDto, QueueTaskStatsDto } from '@/shared/contracts/jobs'
import type { StorageMigrationStatus } from '@/shared/contracts/storage'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { isStorageMigrationInFlightPhase } from '@/shared/contracts/storage'
import { formatBytes, formatDuration } from '@/shared/i18n/format'
import {
  MIGRATION_PHASE_META,
  RUN_STATUS_META,
  STATUS_META,
  TASK_CAPABILITIES,
  useFormatAdminDate,
  type TaskStatus,
} from '@/ui/admin/tasks/meta'
import { RunHistorySheet } from '@/ui/admin/tasks/RunHistorySheet'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/ui/components/card'
import { useI18n } from '@/ui/lib/I18nProvider'

function taskStatus(task: JobSummaryDto, migration?: StorageMigrationStatus): TaskStatus {
  if (TASK_CAPABILITIES[task.taskKey].usesMigrationStatus && migration !== undefined) {
    return MIGRATION_PHASE_META[migration.phase].status
  }
  if (task.liveState?.running) {
    return 'running'
  }
  if (task.kind === 'queue') {
    if ((task.queue?.attentionCount ?? 0) > 0) {
      return 'attention'
    }
    return task.liveState?.suspended ? 'idle' : 'ok'
  }
  if (task.lastRun?.status === 'failed') {
    return 'last-failed'
  }
  if (task.lastRun?.status === 'cancelled') {
    return 'cancelled'
  }
  if (task.liveState?.suspended) {
    return 'suspended'
  }
  return 'ok'
}

function BackupAction() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const createMutation = useMutation({
    ...orpcQuery.admin.backup.create.mutationOptions(),
    onSuccess: async (result) => {
      toast.success(t('admin.tasks.backupCreated'), { description: result.fileName })
      // The manual run wrote a `job_run` row and a new backup file — refresh both surfaces.
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.jobs.key() })
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.backup.key() })
    },
    onError: onMutationError('admin.toast.manualBackupFailed', t),
  })
  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      disabled={createMutation.isPending}
      onClick={() => createMutation.mutate()}
    >
      {createMutation.isPending && <Loader2Icon data-icon className="animate-spin" />}
      {t('admin.tasks.backupNow')}
    </Button>
  )
}

function MigrationActions({ migration }: { migration: StorageMigrationStatus }) {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.jobs.key() })
    await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.migrationStatus.key() })
  }
  const cancelMutation = useMutation({
    ...orpcQuery.admin.storage.cancelMigration.mutationOptions(),
    onSuccess: invalidate,
    onError: onMutationError('admin.toast.migrationCancelFailed', t),
  })
  const resumeMutation = useMutation({
    ...orpcQuery.admin.storage.resumeMigration.mutationOptions(),
    onSuccess: invalidate,
    onError: onMutationError('admin.toast.migrationResumeFailed', t),
  })

  const inFlight = isStorageMigrationInFlightPhase(migration.phase)
  const resumable = migration.phase === 'failed' || migration.phase === 'cancelled' || migration.phase === 'interrupted'
  // 「发起新迁移」only when no migration is in progress (in-flight/interrupted
  // get the cancel/resume buttons instead).
  const canStartNew = !inFlight && migration.phase !== 'interrupted'

  return (
    <>
      {inFlight && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate({})}
        >
          {t('admin.settings.storage.migration.cancel')}
        </Button>
      )}
      {resumable && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={resumeMutation.isPending}
          onClick={() => resumeMutation.mutate({})}
        >
          {t('admin.settings.storage.migration.resume')}
        </Button>
      )}
      {canStartNew && (
        <Button variant="ghost" size="sm" render={<Link to="/admin/settings">{t('admin.tasks.newMigration')}</Link>} />
      )}
    </>
  )
}

// Queue depth/attention/due lines for queue-kind tasks.
function QueueStatsLines({ queue }: { queue: QueueTaskStatsDto }) {
  const { t } = useI18n()
  const date = useFormatAdminDate()
  return (
    <>
      <p>
        {t('admin.tasks.queueDepth', { count: queue.depth })}
        {queue.attentionCount !== null && queue.attentionCount > 0 && (
          <span className="text-status-error-fg">
            {t('admin.tasks.queueAttention', { count: queue.attentionCount })}
          </span>
        )}
      </p>
      {queue.nextDueAt !== null && <p>{t('admin.tasks.nextBatch', { time: date(queue.nextDueAt) })}</p>}
    </>
  )
}

// Migration phase/progress/error lines for the storage-migration task.
function MigrationStatusLines({ migration }: { migration: StorageMigrationStatus }) {
  const { locale, t } = useI18n()
  return (
    <>
      <p>{t('admin.tasks.phase', { phase: t(MIGRATION_PHASE_META[migration.phase].labelId) })}</p>
      <p>
        {t('admin.settings.storage.migration.copiedSummary', {
          copied: migration.copiedObjects,
          bytes: formatBytes(migration.copiedBytes, { locale }),
          skipped: migration.skippedObjects,
        })}
      </p>
      {migration.error !== null && <p className="text-status-error-fg">{migration.error}</p>}
    </>
  )
}

export function TaskCard({ task, migration }: { task: JobSummaryDto; migration?: StorageMigrationStatus }) {
  const date = useFormatAdminDate()
  const { locale, t } = useI18n()
  const capabilities = TASK_CAPABILITIES[task.taskKey]
  const meta = STATUS_META[taskStatus(task, migration)]

  const lastRun = task.lastRun
  const queue = task.queue

  return (
    <Card className="gap-4 py-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t(task.label)}
          <Badge variant={meta.variant}>{t(meta.labelId)}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t(task.description)}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <p>{t('admin.tasks.schedule', { hint: t(task.scheduleHint) })}</p>

        {task.kind === 'scheduled' && task.liveState !== null && (
          <p>
            {task.liveState.nextRunAt !== null
              ? t('admin.tasks.nextRun', { time: date(task.liveState.nextRunAt) })
              : t('admin.tasks.waitingForSchedule')}
          </p>
        )}

        {queue !== null && <QueueStatsLines queue={queue} />}

        {capabilities.usesMigrationStatus && migration !== undefined && migration.phase !== 'idle' && (
          <MigrationStatusLines migration={migration} />
        )}

        {lastRun !== null && (
          <p>
            {t('admin.tasks.lastRun', { time: date(lastRun.startedAt) })} · {t(RUN_STATUS_META[lastRun.status].labelId)}
            {lastRun.durationMs !== null &&
              t('admin.tasks.took', { duration: formatDuration(lastRun.durationMs, { locale }) })}
            {lastRun.trigger === 'manual' && t('admin.tasks.manualTrigger')}
          </p>
        )}
        {lastRun?.error != null && <p className="text-status-error-fg">{lastRun.error}</p>}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {capabilities.action === 'backup' && <BackupAction />}
        {capabilities.action === 'migration' && migration !== undefined && <MigrationActions migration={migration} />}
        {capabilities.link !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link to={capabilities.link.to}>{t(capabilities.link.labelId)}</Link>}
          />
        )}
        {task.kind !== 'queue' && <RunHistorySheet taskKey={task.taskKey} taskLabel={t(task.label)} />}
      </CardFooter>
    </Card>
  )
}

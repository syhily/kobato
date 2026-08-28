import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { JobSummaryDto, QueueTaskStatsDto } from '@/shared/contracts/jobs'
import type { StorageMigrationStatus } from '@/shared/contracts/storage'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { isStorageMigrationInFlightPhase } from '@/shared/contracts/storage'
import { formatBytes, formatDurationMs } from '@/shared/utils/formatter'
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
  const createMutation = useMutation({
    ...orpcQuery.admin.backup.create.mutationOptions(),
    onSuccess: async (result) => {
      toast.success('备份已创建', { description: result.fileName })
      // The manual run wrote a `job_run` row and a new backup file — refresh both surfaces.
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.jobs.key() })
      await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.backup.key() })
    },
    onError: onMutationError('手动备份失败'),
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
      立即备份
    </Button>
  )
}

function MigrationActions({ migration }: { migration: StorageMigrationStatus }) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.jobs.key() })
    await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.storage.migrationStatus.key() })
  }
  const cancelMutation = useMutation({
    ...orpcQuery.admin.storage.cancelMigration.mutationOptions(),
    onSuccess: invalidate,
    onError: onMutationError('取消迁移失败'),
  })
  const resumeMutation = useMutation({
    ...orpcQuery.admin.storage.resumeMigration.mutationOptions(),
    onSuccess: invalidate,
    onError: onMutationError('继续迁移失败'),
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
          取消迁移
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
          从断点继续
        </Button>
      )}
      {canStartNew && <Button variant="ghost" size="sm" render={<Link to="/admin/library/storage">发起新迁移</Link>} />}
    </>
  )
}

// Queue depth/attention/due lines for queue-kind tasks.
function QueueStatsLines({ queue }: { queue: QueueTaskStatsDto }) {
  const date = useFormatAdminDate()
  return (
    <>
      <p>
        待处理 {queue.depth} 条
        {queue.attentionCount !== null && queue.attentionCount > 0 && (
          <span className="text-status-error-fg"> · 需关注 {queue.attentionCount} 条</span>
        )}
      </p>
      {queue.nextDueAt !== null && <p>下一批 {date(queue.nextDueAt)}</p>}
    </>
  )
}

// Migration phase/progress/error lines for the storage-migration task.
function MigrationStatusLines({ migration }: { migration: StorageMigrationStatus }) {
  return (
    <>
      <p>阶段：{MIGRATION_PHASE_META[migration.phase].label}</p>
      <p>
        已复制 {migration.copiedObjects} 个对象（{formatBytes(migration.copiedBytes)}），跳过 {migration.skippedObjects}{' '}
        个
      </p>
      {migration.error !== null && <p className="text-status-error-fg">{migration.error}</p>}
    </>
  )
}

export function TaskCard({ task, migration }: { task: JobSummaryDto; migration?: StorageMigrationStatus }) {
  const date = useFormatAdminDate()
  const capabilities = TASK_CAPABILITIES[task.taskKey]
  const meta = STATUS_META[taskStatus(task, migration)]

  const lastRun = task.lastRun
  const queue = task.queue

  return (
    <Card className="gap-4 py-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {task.label}
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{task.description}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <p>调度：{task.scheduleHint}</p>

        {task.kind === 'scheduled' && task.liveState !== null && (
          <p>{task.liveState.nextRunAt !== null ? `下次运行 ${date(task.liveState.nextRunAt)}` : '等待调度条件满足'}</p>
        )}

        {queue !== null && <QueueStatsLines queue={queue} />}

        {capabilities.usesMigrationStatus && migration !== undefined && migration.phase !== 'idle' && (
          <MigrationStatusLines migration={migration} />
        )}

        {lastRun !== null && (
          <p>
            上次运行 {date(lastRun.startedAt)} · {RUN_STATUS_META[lastRun.status].label}
            {lastRun.durationMs !== null && ` · 耗时 ${formatDurationMs(lastRun.durationMs)}`}
            {lastRun.trigger === 'manual' && ' · 手动触发'}
          </p>
        )}
        {lastRun?.error != null && <p className="text-status-error-fg">{lastRun.error}</p>}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {capabilities.action === 'backup' && <BackupAction />}
        {capabilities.action === 'migration' && migration !== undefined && <MigrationActions migration={migration} />}
        {capabilities.link !== undefined && (
          <Button variant="ghost" size="sm" render={<Link to={capabilities.link.to}>{capabilities.link.label}</Link>} />
        )}
        {task.kind !== 'queue' && <RunHistorySheet taskKey={task.taskKey} taskLabel={task.label} />}
      </CardFooter>
    </Card>
  )
}

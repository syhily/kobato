import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { isoDateTime } from '@/shared/contracts/primitives'
import { storageMigrationStatusDto } from '@/shared/contracts/storage'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Jobs wire contract — the single source for the background-task catalog
// (server aggregation + admin UI), the `job_run` trigger/status enums
// (zod enum AND the SQL CHECK constraint in `infra/db/schema/job-run`),
// and the list/history DTOs.

/** `job_run.trigger` values — zod enum and SQL CHECK share this array. */
export const JOB_RUN_TRIGGERS = ['scheduled', 'manual'] as const
export type JobRunTrigger = (typeof JOB_RUN_TRIGGERS)[number]

/** `job_run.status` values — zod enum and SQL CHECK share this array. */
export const JOB_RUN_STATUSES = ['running', 'success', 'failed', 'cancelled'] as const
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number]

// Stable machine codes persisted in `job_run.error` for system-generated
// failures. The UI maps a known code to a catalog label; every other value is
// a stored technical message (old Chinese/English rows included) and renders
// verbatim, so this list is append-only.
export const JOB_RUN_ERROR_PROCESS_RESTART = 'process-restart'
export const JOB_RUN_ERROR_CODES = [JOB_RUN_ERROR_PROCESS_RESTART] as const
export type JobRunErrorCode = (typeof JOB_RUN_ERROR_CODES)[number]

export type TaskKind = 'scheduled' | 'queue' | 'on-demand'
export type TaskGroup = 'content' | 'system' | 'maintenance'

export interface TaskCatalogEntry {
  key: string
  /** UI message id — the admin task center resolves it with the active locale. */
  label: UiMessageId
  /** UI message id. */
  description: UiMessageId
  kind: TaskKind
  group: TaskGroup
  /** UI message id for the schedule line (e.g. `Daily at 04:00 (site time zone)`). */
  scheduleHint: UiMessageId
}

/** Static metadata for every managed background task. */
export const TASK_CATALOG: readonly TaskCatalogEntry[] = [
  {
    key: 'backup',
    label: 'admin.tasks.task.backup.label',
    description: 'admin.tasks.task.backup.description',
    kind: 'scheduled',
    group: 'system',
    scheduleHint: 'admin.tasks.task.backup.schedule',
  },
  {
    key: 'audit-archive',
    label: 'admin.tasks.task.auditArchive.label',
    description: 'admin.tasks.task.auditArchive.description',
    kind: 'scheduled',
    group: 'system',
    scheduleHint: 'admin.tasks.task.auditArchive.schedule',
  },
  {
    key: 'storage-migration',
    label: 'admin.tasks.task.storageMigration.label',
    description: 'admin.tasks.task.storageMigration.description',
    kind: 'on-demand',
    group: 'system',
    scheduleHint: 'admin.tasks.task.storageMigration.schedule',
  },
  {
    key: 'scheduled-publish',
    label: 'admin.tasks.task.scheduledPublish.label',
    description: 'admin.tasks.task.scheduledPublish.description',
    kind: 'scheduled',
    group: 'content',
    scheduleHint: 'admin.tasks.task.scheduledPublish.schedule',
  },
  {
    key: 'webmention-outbox',
    label: 'admin.tasks.task.webmentionOutbox.label',
    description: 'admin.tasks.task.webmentionOutbox.description',
    kind: 'queue',
    group: 'content',
    scheduleHint: 'admin.tasks.task.webmentionOutbox.schedule',
  },
  {
    key: 'webmention-inbox',
    label: 'admin.tasks.task.webmentionInbox.label',
    description: 'admin.tasks.task.webmentionInbox.description',
    kind: 'queue',
    group: 'content',
    scheduleHint: 'admin.tasks.task.webmentionInbox.schedule',
  },
  {
    key: 'webmention-reverify',
    label: 'admin.tasks.task.webmentionReverify.label',
    description: 'admin.tasks.task.webmentionReverify.description',
    kind: 'queue',
    group: 'content',
    scheduleHint: 'admin.tasks.task.webmentionReverify.schedule',
  },
  {
    key: 'token-purge',
    label: 'admin.tasks.task.tokenPurge.label',
    description: 'admin.tasks.task.tokenPurge.description',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: 'admin.tasks.task.tokenPurge.schedule',
  },
  {
    key: 'kv-sweep',
    label: 'admin.tasks.task.kvSweep.label',
    description: 'admin.tasks.task.kvSweep.description',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: 'admin.tasks.task.kvSweep.schedule',
  },
  {
    key: 'db-maintenance',
    label: 'admin.tasks.task.dbMaintenance.label',
    description: 'admin.tasks.task.dbMaintenance.description',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: 'admin.tasks.task.dbMaintenance.schedule',
  },
  {
    key: 'analytics-retention',
    label: 'admin.tasks.task.analyticsRetention.label',
    description: 'admin.tasks.task.analyticsRetention.description',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: 'admin.tasks.task.analyticsRetention.schedule',
  },
  {
    key: 'geoip-update',
    label: 'admin.tasks.task.geoipUpdate.label',
    description: 'admin.tasks.task.geoipUpdate.description',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: 'admin.tasks.task.geoipUpdate.schedule',
  },
]

// Safe: TASK_CATALOG is a static non-empty literal — the tuple head exists.
const TASK_KEYS = unsafeCast<[string, ...string[]]>(TASK_CATALOG.map((task) => task.key))

export const jobRunDto = z.object({
  id: z.number().int(),
  taskKey: z.string(),
  trigger: z.enum(JOB_RUN_TRIGGERS),
  status: z.enum(JOB_RUN_STATUSES),
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
})
export type JobRunDto = z.infer<typeof jobRunDto>

/** Live scheduler state — null for tasks with no timer (on-demand). */
export const taskLiveStateDto = z.object({
  suspended: z.boolean(),
  nextRunAt: isoDateTime.nullable(),
  running: z.boolean(),
})
export type TaskLiveStateDto = z.infer<typeof taskLiveStateDto>

/** Queue-depth stats for the webmention queue tasks; null elsewhere. */
export const queueTaskStatsDto = z.object({
  depth: z.number().int(),
  nextDueAt: isoDateTime.nullable(),
  attentionCount: z.number().int().nullable(),
})
export type QueueTaskStatsDto = z.infer<typeof queueTaskStatsDto>

export const jobSummaryDto = z.object({
  // Same enum as `jobHistoryInput.taskKey` — a summary key is always a catalog key.
  taskKey: z.enum(TASK_KEYS),
  // Message ids (not copy): the admin task center resolves them per locale.
  label: z.custom<UiMessageId>(),
  description: z.custom<UiMessageId>(),
  kind: z.enum(['scheduled', 'queue', 'on-demand']),
  group: z.enum(['content', 'system', 'maintenance']),
  scheduleHint: z.custom<UiMessageId>(),
  liveState: taskLiveStateDto.nullable(),
  lastRun: jobRunDto.nullable(),
  queue: queueTaskStatsDto.nullable(),
})
export type JobSummaryDto = z.infer<typeof jobSummaryDto>

export const jobsListDto = z.object({
  tasks: z.array(jobSummaryDto),
  storageMigration: storageMigrationStatusDto,
})
export type JobsListDto = z.infer<typeof jobsListDto>

export const jobHistoryInput = z.object({
  taskKey: z.enum(TASK_KEYS),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
})
export type JobHistoryInput = z.infer<typeof jobHistoryInput>

export const jobHistoryOutput = z.object({
  items: z.array(jobRunDto),
  total: z.number().int(),
  hasMore: z.boolean(),
})
export type JobHistoryOutput = z.infer<typeof jobHistoryOutput>

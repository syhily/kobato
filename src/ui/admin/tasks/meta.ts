import type { JobRunErrorCode, JobRunStatus, JobSummaryDto, TaskGroup } from '@/shared/contracts/jobs'
import type { StorageMigrationStatus } from '@/shared/contracts/storage'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { BadgeProps } from '@/ui/components/badge'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'

// Shared presentation meta for the admin task center (TasksView + TaskCard + RunHistorySheet).

/** Catalog task key — a summary key is always a catalog key (jobs contract). */
export type TaskKey = JobSummaryDto['taskKey']

export const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

/** Site-timezone admin timestamp formatter closure (「2026-08-20 04:00:00」). */
export function useFormatAdminDate(): (iso: string) => string {
  const config = useSiteIdentity()
  return (iso: string) => formatLocalDate(new Date(iso), ADMIN_DATE_FORMAT, config)
}

type StatusMeta = { labelId: UiMessageId; variant: BadgeProps['variant'] }

// Statuses shared by the task-card badge and the run-history badge keep ONE label/variant pair.
const SHARED_STATUS_META = {
  running: { labelId: 'admin.tasks.status.running', variant: 'default' },
  failed: { labelId: 'admin.tasks.status.failed', variant: 'destructive' },
  cancelled: { labelId: 'admin.tasks.status.cancelled', variant: 'secondary' },
} as const satisfies Record<string, StatusMeta>

export type TaskStatus =
  | 'running'
  | 'attention'
  | 'last-failed'
  | 'failed'
  | 'interrupted'
  | 'cancelled'
  | 'completed'
  | 'suspended'
  | 'idle'
  | 'ok'

// Status → badge lookup tables; labels are UI message ids the task views resolve through `useI18n()`.
export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  ...SHARED_STATUS_META,
  attention: { labelId: 'admin.tasks.status.attention', variant: 'destructive' },
  'last-failed': { labelId: 'admin.tasks.status.lastFailed', variant: 'destructive' },
  interrupted: { labelId: 'admin.tasks.status.interrupted', variant: 'secondary' },
  completed: { labelId: 'admin.tasks.status.completed', variant: 'secondary' },
  suspended: { labelId: 'admin.tasks.status.suspended', variant: 'outline' },
  idle: { labelId: 'admin.tasks.status.idle', variant: 'outline' },
  ok: { labelId: 'admin.tasks.status.ok', variant: 'secondary' },
}

export const RUN_STATUS_META: Record<JobRunStatus, StatusMeta> = {
  ...SHARED_STATUS_META,
  success: { labelId: 'admin.tasks.status.success', variant: 'secondary' },
}

// System-generated `job_run.error` machine codes → UI labels. Any other error
// string is a stored technical message (legacy rows may be Chinese) and renders
// verbatim, so a known code is the ONLY thing the UI translates.
export const JOB_RUN_ERROR_LABEL_IDS: Record<JobRunErrorCode, UiMessageId> = {
  'process-restart': 'admin.tasks.history.error.processRestart',
}

function isJobRunErrorCode(value: string): value is JobRunErrorCode {
  return Object.hasOwn(JOB_RUN_ERROR_LABEL_IDS, value)
}

export function jobRunErrorLabelId(error: string | null): UiMessageId | null {
  return error !== null && isJobRunErrorCode(error) ? JOB_RUN_ERROR_LABEL_IDS[error] : null
}

// Migration phase → badge status + progress copy, single lookup table.
export const MIGRATION_PHASE_META: Record<
  StorageMigrationStatus['phase'],
  { labelId: UiMessageId; status: TaskStatus }
> = {
  idle: { labelId: 'admin.tasks.phase.idle', status: 'idle' },
  copying: { labelId: 'admin.tasks.phase.copying', status: 'running' },
  switching: { labelId: 'admin.tasks.phase.switching', status: 'running' },
  'catching-up': { labelId: 'admin.tasks.phase.catchingUp', status: 'running' },
  completed: { labelId: 'admin.tasks.phase.completed', status: 'completed' },
  failed: { labelId: 'admin.tasks.phase.failed', status: 'failed' },
  cancelled: { labelId: 'admin.tasks.phase.cancelled', status: 'cancelled' },
  interrupted: { labelId: 'admin.tasks.phase.interrupted', status: 'interrupted' },
}

// Group order follows the catalog's first appearance (system → content → maintenance).
export const GROUP_META: Record<TaskGroup, { labelId: UiMessageId; descriptionId: UiMessageId }> = {
  system: {
    labelId: 'admin.tasks.group.system.label',
    descriptionId: 'admin.tasks.group.system.description',
  },
  content: {
    labelId: 'admin.tasks.group.content.label',
    descriptionId: 'admin.tasks.group.content.description',
  },
  maintenance: {
    labelId: 'admin.tasks.group.maintenance.label',
    descriptionId: 'admin.tasks.group.maintenance.description',
  },
}
export const GROUP_ORDER: readonly TaskGroup[] = ['system', 'content', 'maintenance']

// Per-task capability table: which footer action / cross-link a task card gets
// and whether its status + progress derive from the storage-migration DTO.
// Adding a catalog task = one catalog row + one row here (compile-enforced).
export interface TaskCapabilities {
  /** Footer action slot rendered by TaskCard. */
  action?: 'backup' | 'migration'
  /** Footer cross-link button. */
  link?: { to: string; labelId: UiMessageId }
  /** Status badge + progress lines come from the migration DTO, not job runs. */
  usesMigrationStatus?: boolean
}

export const TASK_CAPABILITIES: Record<TaskKey, TaskCapabilities> = {
  backup: { action: 'backup' },
  'audit-archive': {},
  'storage-migration': { action: 'migration', usesMigrationStatus: true },
  'scheduled-publish': {},
  'webmention-outbox': {
    link: { to: '/admin/webmentions?tab=outbox', labelId: 'admin.tasks.link.sendLog' },
  },
  'webmention-inbox': { link: { to: '/admin/webmentions', labelId: 'admin.tasks.link.review' } },
  'webmention-reverify': {},
  'token-purge': {},
  'kv-sweep': {},
  'db-maintenance': {},
  'analytics-retention': {},
  'geoip-update': {},
}

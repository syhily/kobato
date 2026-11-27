import type { JobRunErrorCode, JobRunStatus, JobSummaryDto, TaskGroup } from '@kobato/api/contracts/admin/jobs'
import type { StorageMigrationStatus } from '@kobato/api/contracts/admin/storage'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { BadgeProps } from '@kobato/ui/components/badge'

import { useSiteIdentity } from '@kobato/ui/lib/blog-settings-context'
import { formatLocalDate } from '@kobato/utils/site-date'

export type TaskKey = JobSummaryDto['taskKey']

export const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

export function useFormatAdminDate(): (iso: string) => string {
  const config = useSiteIdentity()
  return (iso: string) => formatLocalDate(new Date(iso), ADMIN_DATE_FORMAT, config)
}

type StatusMeta = { labelId: UiMessageId; variant: BadgeProps['variant'] }

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

export const JOB_RUN_ERROR_LABEL_IDS: Record<JobRunErrorCode, UiMessageId> = {
  'process-restart': 'admin.tasks.history.error.processRestart',
}

function isJobRunErrorCode(value: string): value is JobRunErrorCode {
  return Object.hasOwn(JOB_RUN_ERROR_LABEL_IDS, value)
}

export function jobRunErrorLabelId(error: string | null): UiMessageId | null {
  return error !== null && isJobRunErrorCode(error) ? JOB_RUN_ERROR_LABEL_IDS[error] : null
}

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

export interface TaskCapabilities {
  action?: 'backup' | 'migration'
  link?: { to: string; labelId: UiMessageId }
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

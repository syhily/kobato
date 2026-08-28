import type { JobRunStatus, JobSummaryDto, TaskGroup } from '@/shared/contracts/jobs'
import type { StorageMigrationStatus } from '@/shared/contracts/storage'
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

type StatusMeta = { label: string; variant: BadgeProps['variant'] }

// Statuses shared by the task-card badge and the run-history badge keep ONE
// label/variant pair.
const SHARED_STATUS_META = {
  running: { label: '运行中', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
  cancelled: { label: '已取消', variant: 'secondary' },
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

// Status → badge lookup table (STATUS_META pattern from WebmentionOutboxView).
export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  ...SHARED_STATUS_META,
  attention: { label: '需关注', variant: 'destructive' },
  'last-failed': { label: '最近失败', variant: 'destructive' },
  interrupted: { label: '已中断', variant: 'secondary' },
  completed: { label: '已完成', variant: 'secondary' },
  suspended: { label: '已挂起', variant: 'outline' },
  idle: { label: '空闲', variant: 'outline' },
  ok: { label: '正常', variant: 'secondary' },
}

export const RUN_STATUS_META: Record<JobRunStatus, StatusMeta> = {
  ...SHARED_STATUS_META,
  success: { label: '成功', variant: 'secondary' },
}

// Migration phase → badge status + progress copy, single lookup table.
export const MIGRATION_PHASE_META: Record<StorageMigrationStatus['phase'], { label: string; status: TaskStatus }> = {
  idle: { label: '空闲', status: 'idle' },
  copying: { label: '正在复制对象', status: 'running' },
  switching: { label: '正在切换存储配置', status: 'running' },
  'catching-up': { label: '正在追补新对象', status: 'running' },
  completed: { label: '已完成', status: 'completed' },
  failed: { label: '失败', status: 'failed' },
  cancelled: { label: '已取消', status: 'cancelled' },
  interrupted: { label: '已中断（可继续）', status: 'interrupted' },
}

// Group order follows the catalog's first appearance: 系统 → 内容 → 维护.
export const GROUP_META: Record<TaskGroup, { label: string; description: string }> = {
  system: { label: '系统', description: '备份、审计归档与存储迁移。' },
  content: { label: '内容', description: '定时发布与 Webmention 队列。' },
  maintenance: { label: '维护', description: '周期性的清理与数据更新。' },
}
export const GROUP_ORDER: readonly TaskGroup[] = ['system', 'content', 'maintenance']

// Per-task capability table: which footer action / cross-link a task card gets
// and whether its status + progress derive from the storage-migration DTO.
// Adding a catalog task = one catalog row + one row here (compile-enforced).
export interface TaskCapabilities {
  /** Footer action slot rendered by TaskCard. */
  action?: 'backup' | 'migration'
  /** Footer cross-link button. */
  link?: { to: string; label: string }
  /** Status badge + progress lines come from the migration DTO, not job runs. */
  usesMigrationStatus?: boolean
}

export const TASK_CAPABILITIES: Record<TaskKey, TaskCapabilities> = {
  backup: { action: 'backup' },
  'audit-archive': {},
  'storage-migration': { action: 'migration', usesMigrationStatus: true },
  'scheduled-publish': {},
  'webmention-outbox': { link: { to: '/admin/webmentions?tab=outbox', label: '查看发送日志' } },
  'webmention-inbox': { link: { to: '/admin/webmentions', label: '去审核' } },
  'webmention-reverify': {},
  'token-purge': {},
  'kv-sweep': {},
  'db-maintenance': {},
  'analytics-retention': {},
  'geoip-update': {},
}

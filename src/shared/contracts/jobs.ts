import { z } from 'zod'

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

export type TaskKind = 'scheduled' | 'queue' | 'on-demand'
export type TaskGroup = 'content' | 'system' | 'maintenance'

export interface TaskCatalogEntry {
  key: string
  label: string
  description: string
  kind: TaskKind
  group: TaskGroup
  /** Pure display copy (e.g. 「每日 04:00（站点时区）」「队列驱动」). */
  scheduleHint: string
}

/** Static metadata for every managed background task. */
export const TASK_CATALOG: readonly TaskCatalogEntry[] = [
  {
    key: 'backup',
    label: '定时备份',
    description: '按备份设置打包数据库并写入存储后端',
    kind: 'scheduled',
    group: 'system',
    scheduleHint: '按备份设置（站点时区）',
  },
  {
    key: 'audit-archive',
    label: '审计日志归档',
    description: '归档超期审计日志到 S3 并清理本地行',
    kind: 'scheduled',
    group: 'system',
    scheduleHint: '每日 04:00（站点时区）',
  },
  {
    key: 'storage-migration',
    label: '存储迁移',
    description: '在本地与 S3 存储之间迁移全部对象',
    kind: 'on-demand',
    group: 'system',
    scheduleHint: '手动发起',
  },
  {
    key: 'scheduled-publish',
    label: '定时文章发布',
    description: '到达发布时间的文章/页面自动上线',
    kind: 'scheduled',
    group: 'content',
    scheduleHint: '最近一篇定时内容的发布时间',
  },
  {
    key: 'webmention-outbox',
    label: 'Webmention 发送队列',
    description: '向提及的目标站点发送 Webmention',
    kind: 'queue',
    group: 'content',
    scheduleHint: '队列驱动',
  },
  {
    key: 'webmention-inbox',
    label: 'Webmention 接收验证队列',
    description: '异步验证收到的 Webmention 来源页面',
    kind: 'queue',
    group: 'content',
    scheduleHint: '队列驱动',
  },
  {
    key: 'webmention-reverify',
    label: 'Webmention 定期重验证',
    description: '周期性复查已通过验证的 Webmention',
    kind: 'queue',
    group: 'content',
    scheduleHint: '队列驱动（24 小时水位）',
  },
  {
    key: 'token-purge',
    label: '验证令牌清理',
    description: '删除过期超过一天的验证令牌',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: '每日 04:30（站点时区）',
  },
  {
    key: 'kv-sweep',
    label: 'KV 过期清扫',
    description: '清理过期的 KV 缓存、一次性令牌与会话',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: '每小时',
  },
  {
    key: 'db-maintenance',
    label: '数据库维护',
    description: 'SQLite 增量整理、优化与历史行修剪',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: '每日 04:30（站点时区）',
  },
  {
    key: 'analytics-retention',
    label: '分析数据清理',
    description: 'DuckDB 访问日志 180 天留存清理与检查点',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: '每日 04:30（站点时区）',
  },
  {
    key: 'geoip-update',
    label: 'GeoIP 数据更新',
    description: '按设置自动更新 GeoIP 数据库',
    kind: 'scheduled',
    group: 'maintenance',
    scheduleHint: '每日 05:30（站点时区）',
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
  label: z.string(),
  description: z.string(),
  kind: z.enum(['scheduled', 'queue', 'on-demand']),
  group: z.enum(['content', 'system', 'maintenance']),
  scheduleHint: z.string(),
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

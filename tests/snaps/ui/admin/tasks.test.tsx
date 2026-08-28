import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobRunDto, JobSummaryDto, JobsListDto } from '@/shared/contracts/jobs'
import type { StorageMigrationStatus } from '@/shared/contracts/storage'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { RunHistoryRow, RunHistorySheet } from '@/ui/admin/tasks/RunHistorySheet'
import { TaskCard } from '@/ui/admin/tasks/TaskCard'
import { TasksView } from '@/ui/admin/tasks/TasksView'

const queryMocks = mockTanstackQuery()

function makeTask(overrides: Partial<JobSummaryDto> = {}): JobSummaryDto {
  return {
    taskKey: 'backup',
    label: '定时备份',
    description: '按备份设置打包数据库并写入存储后端',
    kind: 'scheduled',
    group: 'system',
    scheduleHint: '按备份设置（站点时区）',
    liveState: { suspended: false, nextRunAt: '2026-08-20T20:00:00.000Z', running: false },
    lastRun: null,
    queue: null,
    ...overrides,
  }
}

function makeRun(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 1,
    taskKey: 'backup',
    trigger: 'scheduled',
    status: 'success',
    startedAt: '2026-08-19T20:00:00.000Z',
    finishedAt: '2026-08-19T20:00:01.200Z',
    durationMs: 1200,
    error: null,
    ...overrides,
  }
}

function makeMigration(overrides: Partial<StorageMigrationStatus> = {}): StorageMigrationStatus {
  return {
    phase: 'idle',
    direction: null,
    target: null,
    copiedObjects: 0,
    copiedBytes: 0,
    skippedObjects: 0,
    error: null,
    verification: null,
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

function makeJobsList(overrides: Partial<JobsListDto> = {}): JobsListDto {
  return {
    tasks: [
      // 系统
      makeTask({ lastRun: makeRun() }),
      makeTask({
        taskKey: 'audit-archive',
        label: '审计日志归档',
        kind: 'scheduled',
        scheduleHint: '每日 04:00（站点时区）',
        liveState: { suspended: true, nextRunAt: null, running: false },
        lastRun: makeRun({ id: 2, taskKey: 'audit-archive', status: 'failed', error: 'S3 连接超时' }),
      }),
      makeTask({
        taskKey: 'storage-migration',
        label: '存储迁移',
        kind: 'on-demand',
        scheduleHint: '手动发起',
        liveState: null,
      }),
      // 内容
      makeTask({
        taskKey: 'scheduled-publish',
        label: '定时文章发布',
        group: 'content',
        scheduleHint: '最近一篇定时内容的发布时间',
        // No scheduled content → nextDelayMs() returns null → suspended.
        liveState: { suspended: true, nextRunAt: null, running: false },
      }),
      makeTask({
        taskKey: 'webmention-outbox',
        label: 'Webmention 发送队列',
        kind: 'queue',
        group: 'content',
        scheduleHint: '队列驱动',
        liveState: { suspended: false, nextRunAt: '2026-08-19T20:05:00.000Z', running: true },
        queue: { depth: 3, nextDueAt: '2026-08-19T20:05:00.000Z', attentionCount: 1 },
      }),
      makeTask({
        taskKey: 'webmention-inbox',
        label: 'Webmention 接收验证队列',
        kind: 'queue',
        group: 'content',
        scheduleHint: '队列驱动',
        liveState: { suspended: true, nextRunAt: null, running: false },
        queue: { depth: 0, nextDueAt: null, attentionCount: 0 },
      }),
      // 维护
      makeTask({
        taskKey: 'token-purge',
        label: '验证令牌清理',
        group: 'maintenance',
        scheduleHint: '每日 04:30（站点时区）',
        lastRun: makeRun({ id: 3, taskKey: 'token-purge' }),
      }),
    ],
    storageMigration: makeMigration(),
    ...overrides,
  }
}

beforeEach(() => {
  queryMocks.query = { data: undefined, isLoading: false, isPending: false, isFetching: false, error: null }
  queryMocks.infinite = {
    data: { pages: [] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  }
  queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  queryMocks.queryClient = { invalidateQueries: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() }
})

describe('snapshot: TasksView', () => {
  it('renders the loading skeleton before the first poll resolves', () => {
    queryMocks.query = { ...queryMocks.query, isLoading: true }
    const html = stableHtml(renderInRouter(<TasksView />, '/admin/tasks'))
    expect(html).toContain('任务管理')
    expect(html).not.toContain('定时备份')
  })

  it('renders the three catalog groups with status badges and per-task actions', () => {
    queryMocks.query = { ...queryMocks.query, data: makeJobsList() }
    const html = stableHtml(renderInRouter(<TasksView />, '/admin/tasks'))

    // Groups.
    expect(html).toContain('系统')
    expect(html).toContain('内容')
    expect(html).toContain('维护')

    // Status badges (site timezone Asia/Shanghai: 2026-08-20T20:00Z → 04:00 next day).
    expect(html).toContain('正常')
    expect(html).toContain('已挂起')
    expect(html).toContain('最近失败')
    expect(html).toContain('运行中')
    expect(html).toContain('空闲')
    expect(html).toContain('下次运行 2026-08-21 04:00:00')
    expect(html).toContain('上次运行 2026-08-20 04:00:00 · 成功 · 耗时 1.2 秒')
    expect(html).toContain('S3 连接超时')

    // Queue stats.
    expect(html).toContain('待处理 3 条')
    expect(html).toContain('需关注 1 条')
    expect(html).toContain('下一批 2026-08-20 04:05:00')

    // Actions: backup mutation, cross-links, history sheets (non-queue tasks only).
    expect(html).toContain('立即备份')
    expect(html).toContain('href="/admin/webmentions?tab=outbox"')
    expect(html).toContain('去审核')
    expect(html).toContain('发起新迁移')
    expect(html).toContain('href="/admin/library/storage"')
    // 5 non-queue tasks → 5 history triggers; queue tasks never record history.
    expect(html.match(/执行历史/g)).toHaveLength(5)
    // Idle migration offers neither cancel nor resume.
    expect(html).not.toContain('取消迁移')
    expect(html).not.toContain('从断点继续')
  })

  it('renders an inline error when the poll fails', () => {
    queryMocks.query = { ...queryMocks.query, error: new Error('boom') }
    const html = stableHtml(renderInRouter(<TasksView />, '/admin/tasks'))
    expect(html).toContain('加载任务状态失败')
  })
})

describe('snapshot: TaskCard migration phases', () => {
  const migrationTask = makeTask({
    taskKey: 'storage-migration',
    label: '存储迁移',
    kind: 'on-demand',
    scheduleHint: '手动发起',
    liveState: null,
  })

  it('offers 取消迁移 while a migration is in flight', () => {
    const html = stableHtml(
      renderInRouter(
        <TaskCard
          task={migrationTask}
          migration={makeMigration({ phase: 'copying', copiedObjects: 12, copiedBytes: 2048, skippedObjects: 1 })}
        />,
        '/admin/tasks',
      ),
    )
    expect(html).toContain('运行中')
    expect(html).toContain('正在复制对象')
    expect(html).toContain('已复制 12 个对象（2.0 KB），跳过 1 个')
    expect(html).toContain('取消迁移')
    expect(html).not.toContain('从断点继续')
    expect(html).not.toContain('发起新迁移')
  })

  it('offers 从断点继续 on an interrupted migration', () => {
    const html = stableHtml(
      renderInRouter(
        <TaskCard task={migrationTask} migration={makeMigration({ phase: 'interrupted' })} />,
        '/admin/tasks',
      ),
    )
    expect(html).toContain('已中断')
    expect(html).toContain('从断点继续')
    expect(html).not.toContain('取消迁移')
    expect(html).not.toContain('发起新迁移')
  })
})

describe('snapshot: RunHistorySheet', () => {
  it('renders only the trigger on SSR; the sheet body is client-only', () => {
    const html = stableHtml(renderInRouter(<RunHistorySheet taskKey="backup" taskLabel="定时备份" />, '/admin/tasks'))
    expect(html).toContain('执行历史')
    expect(html).not.toContain('暂无执行记录')
  })
})

describe('snapshot: RunHistoryRow', () => {
  it('renders a successful scheduled run', () => {
    const html = stableHtml(renderToHtml(<RunHistoryRow run={makeRun()} />))
    expect(html).toContain('成功')
    expect(html).toContain('定时触发')
    expect(html).toContain('2026-08-20 04:00:00')
    expect(html).toContain('耗时 1.2 秒')
  })

  it('renders a failed manual run with its error', () => {
    const html = stableHtml(
      renderToHtml(
        <RunHistoryRow
          run={makeRun({ trigger: 'manual', status: 'failed', durationMs: 300, error: '备份单飞冲突' })}
        />,
      ),
    )
    expect(html).toContain('失败')
    expect(html).toContain('手动触发')
    expect(html).toContain('耗时 300 毫秒')
    expect(html).toContain('备份单飞冲突')
  })
})

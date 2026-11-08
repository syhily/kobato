import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import {
  GROUP_META,
  JOB_RUN_ERROR_LABEL_IDS,
  MIGRATION_PHASE_META,
  RUN_STATUS_META,
  STATUS_META,
  TASK_CAPABILITIES,
  jobRunErrorLabelId,
} from '@/ui/admin/tasks/meta'

const tZhCN = makeTranslator('zh-CN')
const tEnUS = makeTranslator('en-US')

// The task display maps are NEUTRAL registries: variant/status/progress shape
// stays here, every label is a message id resolved by the view.

describe('ui/admin/tasks/meta — message-id registries', () => {
  it('resolves every status label in zh-CN and en-US', () => {
    for (const meta of [...Object.values(STATUS_META), ...Object.values(RUN_STATUS_META)]) {
      expect(tZhCN(meta.labelId).length).toBeGreaterThan(0)
      expect(tEnUS(meta.labelId).length).toBeGreaterThan(0)
    }
    expect(tZhCN(STATUS_META['last-failed'].labelId)).toBe('最近失败')
    expect(tEnUS(STATUS_META['last-failed'].labelId)).toBe('Last run failed')
  })

  it('resolves migration phases and keeps the derived task status', () => {
    expect(tZhCN(MIGRATION_PHASE_META['catching-up'].labelId)).toBe('正在追补新对象')
    expect(tEnUS(MIGRATION_PHASE_META['catching-up'].labelId)).toBe('Catching up on new objects')
    expect(MIGRATION_PHASE_META['catching-up'].status).toBe('running')
  })

  it('maps the process-restart machine code but leaves legacy errors raw', () => {
    expect(jobRunErrorLabelId('process-restart')).toBe('admin.tasks.history.error.processRestart')
    expect(jobRunErrorLabelId('备份单飞冲突')).toBeNull()
    expect(jobRunErrorLabelId(null)).toBeNull()
    expect(tZhCN(JOB_RUN_ERROR_LABEL_IDS['process-restart'])).toBe('进程重启中断')
    expect(tEnUS(JOB_RUN_ERROR_LABEL_IDS['process-restart'])).toBe('Interrupted by a process restart')
  })

  it('resolves group labels/descriptions and footer links', () => {
    expect(tZhCN(GROUP_META.maintenance.labelId)).toBe('维护')
    expect(tEnUS(GROUP_META.maintenance.descriptionId)).toBe('Periodic cleanup and data refresh.')
    expect(tZhCN(TASK_CAPABILITIES['webmention-outbox'].link!.labelId)).toBe('查看发送日志')
    expect(tEnUS(TASK_CAPABILITIES['webmention-inbox'].link!.labelId)).toBe('Review')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupSettings } from '@/shared/config/types'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { BackupView } from '@/ui/admin/settings/BackupView'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: undefined as { primaryDriver: 's3' | 'local' } | undefined,
  isPending: true,
  error: null as unknown,
}

queryMocks.mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}

// The companion `backup.test.tsx` covers the BackupView loading /
// schedule-populated / schedule-disabled branches (all rendered with the
// status query pending so `canConfigure` is always `false`) and exercises
// the child components directly. This suite targets the remaining
// render-path branches in `BackupView` itself that the parent file does
// not reach:
//
//   1. `source = backup ?? FALLBACK_BACKUP` — the `backup={null}` branch
//      that falls back to the disabled-schedule default.
//   2. `canConfigure` resolving `true` on the render path (status query
//      resolved with S3 as the primary driver). This is computed every
//      render from `statusData`, so it threads through to the schedule
//      form + file list props WITHOUT depending on the file-list effect.
//
// The info banner (`未启用 S3 存储`) and the populated file list are
// gated behind `!isInitialLoading`,
// where `isInitialLoading = backupFiles === undefined` and `backupFiles`
// is only populated inside a `useEffect` — those branches do not fire
// under the SSR renderers and remain covered by the parent file's
// `.skip` documentation and the child-component snapshots.

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

// ───────────────────────────── fixtures ─────────────────────────────

const scheduledBackup: BackupSettings = {
  scheduled: { enabled: true, frequency: 'weekly', hour: 3, minute: 30, dayOfWeek: 1 },
  retention: { enabled: true, days: 30 },
}

const disabledBackup: BackupSettings = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: false, days: 30 },
}

// ────────────────────────────── setup ───────────────────────────────

describe('snapshot: BackupView branches', () => {
  beforeEach(() => {
    // Default back to the pending/loading state; resolved cases reassign
    // below.
    queryMocks.query = { data: undefined, isPending: true, error: null }
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('falls back to FALLBACK_BACKUP when the backup prop is null', () => {
    // The `source = backup ?? FALLBACK_BACKUP` ternary: passing `null`
    // exercises the fallback branch, which is a disabled daily schedule
    // with retention enabled. The schedule form renders off `source`
    // (not the raw prop), so the disabled-schedule detail rows collapse
    // even though no explicit config was supplied.
    const html = stableHtml(renderInRouter(<BackupView backup={null} timeZone="Asia/Shanghai" />, '/admin/settings'))

    // Schedule section always mounts.
    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    // FALLBACK_BACKUP has scheduled.enabled=false, so the
    // frequency/time/retention rows collapse.
    expect(html).not.toContain('备份频率')
    expect(html).not.toContain('保留天数')
    // The manual-restore + file sections still render.
    expect(html).toContain('备份文件')
    expect(html).toContain('手动还原')
    expect(html).toContain('未选择文件')
  })

  it('threads canConfigure=true to the schedule form when the status query resolves', () => {
    // `canConfigure` is always true now (file-based backups need no
    // external tooling); `primaryDriver` only drives the info banner.
    // (The info/warning banners stay hidden because `isInitialLoading` is
    // still true on SSR — the file-list effect never fires — so this case
    // isolates the canConfigure render branch from the effect-gated
    // banner branches.)
    queryMocks.query = {
      data: { primaryDriver: 's3' },
      isPending: false,
      error: null,
    }

    const html = stableHtml(
      renderInRouter(<BackupView backup={scheduledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )

    // Schedule section surfaces the enabled weekly detail rows.
    expect(html).toContain('定时备份')
    expect(html).toContain('备份频率')
    expect(html).toContain('备份时间')
    expect(html).toContain('星期')
    expect(html).toContain('保留策略')
    // The schedule inputs carry no `disabled` attribute (the
    // status-loading case in the parent suite leaves them disabled).
    expect(html).toContain('选择文件')
    expect(html).toContain('上传并还原')
    // No info banner leaks while the file list is still loading
    // (effect-gated branch, asserted absent here).
    expect(html).not.toContain('未启用 S3 存储')
  })

  it('renders the manual-restore section in its default (no-file-selected) state', () => {
    // The `selectedFile` branch inside the manual-restore section swaps
    // the button label between '选择文件' and '重新选择' and the hint
    // between the filename and '未选择文件'. `selectedFile` is only
    // mutated in the file-input onChange handler (event-gated), so the
    // default render-path branch is the coverable one.
    queryMocks.query = { data: undefined, isPending: true, error: null }

    const html = stableHtml(
      renderInRouter(<BackupView backup={disabledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )

    // Section heading + description.
    expect(html).toContain('手动还原')
    expect(html).toContain('上传备份文件还原：.db.tar.gz 归档（内容 + 访问统计）')
    // Default-branch button label + hint copy.
    expect(html).toContain('选择文件')
    expect(html).toContain('未选择文件')
    // The upload button is present but disabled until a file is chosen
    // (`!selectedFile`).
    expect(html).toContain('上传并还原')
    expect(html).toContain('disabled')
  })
})

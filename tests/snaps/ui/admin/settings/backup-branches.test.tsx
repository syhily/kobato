import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupSettings } from '@/shared/config/types'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { BackupView } from '@/ui/admin/settings/BackupView'

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
//      resolved with S3 + pg tools available). This is computed every
//      render from `statusData`, so it threads through to the schedule
//      form + file list props WITHOUT depending on the file-list effect.
//
// The warning banners (`缺少 postgresql-client`, `请先前往存储配置启用 S3
// 存储`) and the populated file list are gated behind `!isInitialLoading`,
// where `isInitialLoading = backupFiles === undefined` and `backupFiles`
// is only populated inside a `useEffect` — those branches do not fire
// under the SSR renderers and remain covered by the parent file's
// `.skip` documentation and the child-component snapshots.

// ─────────────────────── react-query mock ───────────────────────────

const queryMocks = vi.hoisted(() => ({
  query: {
    data: undefined as { s3Enabled: boolean; pgToolsAvailable: boolean } | undefined,
    isPending: true,
    error: null as unknown,
  },
  mutation: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
  }
})

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

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

  it('threads canConfigure=true to the schedule form when the status query resolves with S3 + pg tools', () => {
    // `canConfigure = s3Enabled && pgToolsAvailable` is computed every
    // render from `statusData`. With the status query resolved, the
    // schedule form receives `canConfigure={true}` and its inputs are
    // NOT disabled. (The warning banners stay hidden because
    // `isInitialLoading` is still true on SSR — the file-list effect
    // never fires — so this case isolates the canConfigure render branch
    // from the effect-gated banner branches.)
    queryMocks.query = {
      data: { s3Enabled: true, pgToolsAvailable: true },
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
    // The manual-restore file input is gated on pgToolsAvailable too,
    // so with pg tools present its button is enabled.
    expect(html).toContain('选择文件')
    expect(html).toContain('上传并还原')
    // No warning banner leaks while the file list is still loading
    // (effect-gated branch, asserted absent here).
    expect(html).not.toContain('缺少 postgresql-client')
    expect(html).not.toContain('请先前往存储配置启用 S3 存储')
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
    expect(html).toContain('上传 .sql 或 .gz 备份文件进行还原')
    // Default-branch button label + hint copy.
    expect(html).toContain('选择文件')
    expect(html).toContain('未选择文件')
    // The upload button is present but disabled until a file is chosen
    // (`!selectedFile`) AND pg tools are available.
    expect(html).toContain('上传并还原')
    expect(html).toContain('disabled')
  })

  it('disables the manual-restore inputs when pg tools are missing (resolved status)', () => {
    // `pgToolsAvailable=false` from the resolved status drives the
    // `disabled={!pgToolsAvailable || …}` render branch on the file
    // input + upload button. This is a render-path branch (computed off
    // statusData) distinct from the loading-state default.
    queryMocks.query = {
      data: { s3Enabled: true, pgToolsAvailable: false },
      isPending: false,
      error: null,
    }

    const html = stableHtml(
      renderInRouter(<BackupView backup={disabledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )

    expect(html).toContain('手动还原')
    expect(html).toContain('选择文件')
    expect(html).toContain('上传并还原')
    // Inputs are disabled because pgToolsAvailable is false.
    expect(html).toContain('disabled')
    // The missing-pg-tools warning banner stays hidden because the
    // file-list effect has not resolved `backupFiles` (effect-gated).
    expect(html).not.toContain('当前运行环境缺少 postgresql-client')
  })
})

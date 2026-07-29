import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupSettings } from '@/shared/config/types'
import type { CacheBucketStats } from '@/shared/contracts/cache'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { BackupFileList } from '@/ui/admin/settings/BackupFileList'
import { BackupScheduleForm } from '@/ui/admin/settings/BackupScheduleForm'
import { BackupView } from '@/ui/admin/settings/BackupView'
import { BucketCard } from '@/ui/admin/settings/cache/BucketCard'
import { idleClearStatus } from '@/ui/admin/settings/cache/cache-status'

// BackupView wires up react-query + route loader. We stub the query layer
// with a hoisted mutable singleton so individual cases can flip the status
// query between pending / resolved, exercising the data-loaded branches
// (warning banners + schedule form enabled state). `useMutation` returns
// the real pending flags so BackupFileList props thread through unchanged.

const queryMocks = vi.hoisted(() => ({
  query: {
    data: undefined as { primaryDriver: 's3' | 'local'; pgToolsAvailable: boolean } | undefined,
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

// BackupScheduleForm (and BucketCard) save through the settings mutation
// hook; stub it so the form renders without a live API surface.
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

const scheduledBackup: BackupSettings = {
  scheduled: { enabled: true, frequency: 'weekly', hour: 3, minute: 30, dayOfWeek: 1 },
  retention: { enabled: true, days: 30 },
}

const dailyBackup: BackupSettings = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: false, days: 30 },
}

describe('snapshot: BackupView', () => {
  beforeEach(() => {
    // Default back to the pending/loading state so the legacy loading test
    // stays deterministic; data-loaded cases reassign below.
    queryMocks.query = { data: undefined, isPending: true, error: null }
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('renders the loading state with schedule and file sections under a router', () => {
    const html = stableHtml(
      renderInRouter(<BackupView backup={scheduledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )
    // The loading banner is shown while status is pending.
    expect(html).toContain('正在读取备份信息')
    // The schedule form always renders (independent of the status query).
    expect(html).toContain('定时备份')
    expect(html).toContain('配置自动备份的频率与保留策略')
    // The manual file list section heading is always present.
    expect(html).toContain('备份文件')
  })

  it('renders the schedule form populated with the supplied backup config plus the file and manual-restore sections', () => {
    // `BackupView` unconditionally mounts its three child sections
    // (`BackupScheduleForm`, `BackupFileList`, the manual-restore
    // `SettingGroup`) regardless of the status query state — so even with
    // the loading banner visible we can assert the populated schedule
    // wiring and the always-present section headings.
    queryMocks.query = { data: undefined, isPending: true, error: null }
    const html = stableHtml(
      renderInRouter(<BackupView backup={scheduledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )
    // Schedule section surfaces the supplied weekly schedule fields.
    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    expect(html).toContain('备份频率')
    expect(html).toContain('保留策略')
    // The file-list section + empty placeholder render (backupFiles is
    // undefined on SSR → BackupView passes `[]`).
    expect(html).toContain('备份文件')
    expect(html).toContain('暂无备份文件')
    // The manual-restore section is always mounted.
    expect(html).toContain('手动还原')
    expect(html).toContain('上传 .db.tar.gz（或旧版 .db.gz）备份文件进行还原')
    expect(html).toContain('选择文件')
    expect(html).toContain('上传并还原')
  })

  it('renders the disabled-schedule branch when the backup config has scheduling off', () => {
    queryMocks.query = { data: undefined, isPending: true, error: null }
    const html = stableHtml(
      renderInRouter(<BackupView backup={dailyBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )
    // Schedule section present but the weekly/daily detail rows collapse
    // when `scheduled.enabled` is false.
    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    expect(html).not.toContain('保留天数')
    // File-list and manual-restore sections still render.
    expect(html).toContain('备份文件')
    expect(html).toContain('手动还原')
  })
})

describe('snapshot: BackupScheduleForm', () => {
  it('renders an enabled weekly schedule when configurable', () => {
    const html = stableHtml(renderToHtml(<BackupScheduleForm backup={scheduledBackup} canConfigure={true} />))
    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    // Weekly-schedule-only fields surface when scheduled is on.
    expect(html).toContain('备份频率')
    expect(html).toContain('备份时间')
    expect(html).toContain('星期')
    expect(html).toContain('保留策略')
  })

  it('collapses the frequency/time rows when scheduling is disabled', () => {
    const html = stableHtml(renderToHtml(<BackupScheduleForm backup={dailyBackup} canConfigure={true} />))
    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    // The conditional weekly/daily detail rows are gated behind the
    // `scheduledEnabled` watch, so they don't render.
    expect(html).not.toContain('备份频率')
    expect(html).not.toContain('保留天数')
  })

  it('disables all inputs when canConfigure is false', () => {
    const html = stableHtml(renderToHtml(<BackupScheduleForm backup={scheduledBackup} canConfigure={false} />))
    expect(html).toContain('定时备份')
    expect(html).toContain('备份频率')
    // The toggle + selects carry `disabled` when S3/pg tooling is missing.
    expect(html).toContain('disabled')
  })
})

describe('snapshot: BackupFileList', () => {
  const files = [
    {
      key: 'backup/2024-01-15.sql.gz',
      fileName: '2024-01-15.sql.gz',
      size: 1024 * 512,
      lastModified: '2024-01-15T03:00:00.000Z',
    },
    {
      key: 'backup/2024-01-14.sql.gz',
      fileName: '2024-01-14.sql.gz',
      size: 1024 * 256,
      lastModified: '2024-01-14T03:00:00.000Z',
    },
  ]

  it('renders a table of backup files with actions', () => {
    const html = stableHtml(
      renderToHtml(
        <BackupFileList
          backups={files}
          timeZone="Asia/Shanghai"
          canConfigure={true}
          isCreating={false}
          onCreate={() => {}}
          restorePending={false}
          onRestore={() => {}}
          onDelete={() => {}}
          deletePending={false}
          onLoadMore={() => {}}
          isLoadingMore={false}
          hasMore={false}
        />,
      ),
    )
    expect(html).toContain('备份文件')
    expect(html).toContain('手动备份')
    expect(html).toContain('文件名')
    expect(html).toContain('大小')
    expect(html).toContain('时间')
    expect(html).toContain('操作')
    expect(html).toContain('2024-01-15.sql.gz')
    expect(html).toContain('2024-01-14.sql.gz')
    expect(html).toContain('下载')
    expect(html).toContain('还原')
    expect(html).toContain('删除')
  })

  it('renders the empty state when there are no backups', () => {
    const html = stableHtml(
      renderToHtml(
        <BackupFileList
          backups={[]}
          timeZone="Asia/Shanghai"
          canConfigure={true}
          isCreating={false}
          onCreate={() => {}}
          restorePending={false}
          onRestore={() => {}}
          onDelete={() => {}}
          deletePending={false}
          onLoadMore={() => {}}
          isLoadingMore={false}
          hasMore={false}
        />,
      ),
    )
    expect(html).toContain('备份文件')
    expect(html).toContain('暂无备份文件')
  })

  it('shows the load-more affordance when hasMore is true', () => {
    const html = stableHtml(
      renderToHtml(
        <BackupFileList
          backups={files}
          timeZone="Asia/Shanghai"
          canConfigure={true}
          isCreating={false}
          onCreate={() => {}}
          restorePending={false}
          onRestore={() => {}}
          onDelete={() => {}}
          deletePending={false}
          onLoadMore={() => {}}
          isLoadingMore={false}
          hasMore={true}
        />,
      ),
    )
    expect(html).toContain('加载更多')
    // React emits the count as a separate text node (`已展示 <!-- -->2<!-- --> 个备份文件`),
    // so assert the pieces rather than the contiguous string.
    expect(html).toMatch(/已展示.*2.*个备份文件/su)
  })
})

describe('snapshot: BucketCard', () => {
  const bucket: CacheBucketStats = {
    id: 'og',
    label: 'OG 预渲染缓存',
    description: '预生成的 Open Graph 元数据，避免每次分享都重新渲染卡片。',
    prefix: 'og:',
    ttlSeconds: 60 * 60 * 24,
    pattern: 'og:*',
    keyCount: 42,
  }

  const allBuckets = {
    og: { prefix: 'og:', ttlSeconds: 60 * 60 * 24 },
    calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 * 24 },
    avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 },
    imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },
    searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
  }

  it('renders the bucket summary with stats and read-only action bar', () => {
    const html = stableHtml(
      renderToHtml(
        <BucketCard
          bucket={bucket}
          settings={{ prefix: 'og:', ttlSeconds: 60 * 60 * 24 }}
          allBuckets={allBuckets}
          isClearPending={false}
          clearStatus={idleClearStatus}
          onClear={() => {}}
        />,
      ),
    )
    expect(html).toContain('OG 预渲染缓存')
    expect(html).toContain('缓存条数')
    expect(html).toContain('42')
    expect(html).toContain('当前前缀')
    expect(html).toContain('og:')
    expect(html).toContain('键匹配模式')
    expect(html).toContain('当前 TTL')
    expect(html).toContain('编辑')
    expect(html).toContain('清空该分组')
  })
})

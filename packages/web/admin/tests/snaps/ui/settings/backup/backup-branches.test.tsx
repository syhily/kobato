import type { BackupLoaderShape } from '@kobato/settings/projection.ts'

import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { BackupView } from '@kobato/web-admin/ui/settings/backup/BackupView.tsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// BackupView render-path branches `backup.test.tsx` does not reach, notably
// `backup ?? FALLBACK_BACKUP`; effect-gated file-list branches stay in the parent file.

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

const scheduledBackup: BackupLoaderShape = {
  scheduled: { enabled: true, frequency: 'weekly', hour: 3, minute: 30, dayOfWeek: 1 },
  retention: { enabled: true, days: 30 },
  encryption: { enabled: false, password: '' },
  passwordMask: null,
}

const disabledBackup: BackupLoaderShape = {
  scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
  retention: { enabled: false, days: 30 },
  encryption: { enabled: false, password: '' },
  passwordMask: null,
}

describe('snapshot: BackupView branches', () => {
  beforeEach(() => {
    queryMocks.query = { data: undefined, isPending: true, error: null }
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('falls back to FALLBACK_BACKUP when the backup prop is null', () => {
    const html = stableHtml(renderInRouter(<BackupView backup={null} timeZone="Asia/Shanghai" />, '/admin/settings'))

    expect(html).toContain('定时备份')
    expect(html).toContain('启用定时备份')
    expect(html).not.toContain('备份频率')
    expect(html).not.toContain('保留天数')
    expect(html).toContain('备份文件')
    expect(html).toContain('手动还原')
    expect(html).toContain('未选择文件')
  })

  it('renders the enabled schedule form when the status query resolves', () => {
    // File-based backups need no external tooling; `primaryDriver` only
    // drives the info banner.
    queryMocks.query = {
      data: { primaryDriver: 's3' },
      isPending: false,
      error: null,
    }

    const html = stableHtml(
      renderInRouter(<BackupView backup={scheduledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )

    expect(html).toContain('定时备份')
    expect(html).toContain('备份频率')
    expect(html).toContain('备份时间')
    expect(html).toContain('星期')
    expect(html).toContain('保留策略')
    expect(html).toContain('选择文件')
    expect(html).toContain('上传并还原')
    expect(html).not.toContain('未启用 S3 存储')
  })

  it('renders the manual-restore section in its default (no-file-selected) state', () => {
    // `selectedFile` only changes via the file-input onChange (event-gated) — the no-file branch is all SSR can render.
    queryMocks.query = { data: undefined, isPending: true, error: null }

    const html = stableHtml(
      renderInRouter(<BackupView backup={disabledBackup} timeZone="Asia/Shanghai" />, '/admin/settings'),
    )

    expect(html).toContain('手动还原')
    expect(html).toContain('上传备份文件还原：.db.tar.gz 归档（内容 + 访问统计 + 配置')
    expect(html).toContain('选择文件')
    expect(html).toContain('未选择文件')
    expect(html).toContain('上传并还原')
    expect(html).toContain('disabled')
  })
})

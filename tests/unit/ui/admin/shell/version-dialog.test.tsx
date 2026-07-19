// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UpdateCheckResult, UpdateJobStatus } from '@/shared/types/update'

const orpcMocks = vi.hoisted(() => ({
  check: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('@/client/api/client', () => ({
  orpc: { admin: { update: { check: orpcMocks.check, apply: orpcMocks.apply } } },
}))

const queryState = vi.hoisted(() => ({
  status: { data: undefined as UpdateJobStatus | undefined },
}))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    github: { avatar: { queryOptions: () => ({ queryKey: ['github-avatar'] }) } },
    admin: { update: { status: { queryOptions: () => ({ queryKey: ['admin-update-status'] }) } } },
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) =>
      opts.queryKey[0] === 'admin-update-status' ? { data: queryState.status.data } : { data: undefined },
  }
})

vi.mock('@/shared/config/version', () => ({
  APP_NAME: 'kobato',
  APP_VERSION: '6.4.0',
  APP_DESCRIPTION: 'a test blog',
  APP_AUTHOR: { name: 'Tester' },
  APP_HOMEPAGE: 'https://example.com',
  APP_REPOSITORY: 'https://github.com/syhily/kobato',
}))

const { VersionDialog } = await import('@/ui/admin/shell/VersionDialog')

const noop = () => undefined

function checkResult(overrides: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    currentVersion: '6.4.0',
    latestVersion: '6.5.0',
    tagName: 'v6.5.0',
    htmlUrl: 'https://github.com/syhily/kobato/releases/tag/v6.5.0',
    updateAvailable: true,
    canSelfUpdate: true,
    reasons: [],
    ...overrides,
  }
}

describe('ui/admin/shell/VersionDialog', () => {
  beforeEach(() => {
    orpcMocks.check.mockReset()
    orpcMocks.apply.mockReset()
    queryState.status.data = undefined
  })

  it('renders the idle prompt before any check', () => {
    render(<VersionDialog open={true} onOpenChange={noop} />)
    expect(screen.getByText('点击上方按钮检查是否有新版本')).toBeInTheDocument()
  })

  it('shows up-to-date after a check with no newer release', async () => {
    orpcMocks.check.mockResolvedValue(
      checkResult({ updateAvailable: false, latestVersion: '6.4.0', tagName: 'v6.4.0' }),
    )
    render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('当前已是最新版本')).toBeInTheDocument())
  })

  it('shows an error when the check fails', async () => {
    orpcMocks.check.mockRejectedValue(new Error('network down'))
    render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('检查失败，请稍后重试')).toBeInTheDocument())
  })

  it('offers 立即更新 with the confirm line when the deployment can self-update', async () => {
    orpcMocks.check.mockResolvedValue(checkResult())
    render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('发现新版本：')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument()
    expect(screen.getByText('将下载并替换当前二进制，随后自动重启')).toBeInTheDocument()
  })

  it('shows the gate reasons instead of 立即更新 when self-update is refused', async () => {
    orpcMocks.check.mockResolvedValue(checkResult({ canSelfUpdate: false, reasons: ['Docker 部署请拉取新镜像升级'] }))
    render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('Docker 部署请拉取新镜像升级')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /立即更新/ })).not.toBeInTheDocument()
  })

  it('runs the apply flow and renders every job state', async () => {
    orpcMocks.check.mockResolvedValue(checkResult())
    orpcMocks.apply.mockResolvedValue({ fromVersion: '6.4.0', toVersion: '6.5.0' })
    const view = render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }))
    await waitFor(() => expect(orpcMocks.apply).toHaveBeenCalledWith({}))

    // Before the first poll resolves the panel assumes downloading.
    await waitFor(() => expect(screen.getByText('正在下载更新包…')).toBeInTheDocument())

    const setJob = (status: UpdateJobStatus) => {
      queryState.status.data = status
      view.rerender(<VersionDialog open={true} onOpenChange={noop} />)
    }

    setJob({ state: 'verifying', targetVersion: 'v6.5.0' })
    expect(screen.getByText('正在校验更新包…')).toBeInTheDocument()

    setJob({ state: 'swapping', targetVersion: 'v6.5.0' })
    expect(screen.getByText('正在替换二进制…')).toBeInTheDocument()

    setJob({ state: 'restarting', targetVersion: 'v6.5.0' })
    expect(screen.getByText('重启中，约 10 秒后自动刷新')).toBeInTheDocument()

    setJob({ state: 'failed', error: '更新包校验失败，已中止', targetVersion: 'v6.5.0' })
    expect(screen.getByText('更新失败：更新包校验失败，已中止')).toBeInTheDocument()
  })

  it('shows an apply error when the job cannot start', async () => {
    orpcMocks.check.mockResolvedValue(checkResult())
    orpcMocks.apply.mockRejectedValue(new Error('已有更新任务正在进行中'))
    render(<VersionDialog open={true} onOpenChange={noop} />)

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }))
    await waitFor(() => expect(screen.getByText(/启动更新失败/)).toBeInTheDocument())
  })
})

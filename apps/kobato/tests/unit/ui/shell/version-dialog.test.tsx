// @vitest-environment happy-dom

import type { UpdateCheckResult, UpdateJobStatus } from '@kobato/api/contracts/admin/update'

import { installFetch, jsonResponse } from '@kobato/test/fetch'
import { renderWithI18n, wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = installFetch()

vi.mock('@kobato/distribution/app', () => ({
  APP_NAME: 'kobato',
  APP_VERSION: '6.4.0',
  APP_DESCRIPTION: 'a test blog',
  APP_AUTHOR: { name: 'Tester' },
  APP_HOMEPAGE: 'https://example.com',
  APP_REPOSITORY: 'https://github.com/syhily/kobato',
}))

const { orpcQuery } = await import('@kobato/api/browser/orpc-query')

const { VersionDialog } = await import('@/ui/shell/VersionDialog')

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
  let queryClient: QueryClient
  const statusNow = { current: { state: 'idle', targetVersion: null } as unknown as UpdateJobStatus }

  beforeEach(() => {
    mockFetch.reset()
    statusNow.current = { state: 'idle' }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/rpc/admin/update/status')) {
        return jsonResponse({ json: statusNow.current })
      }
      return mockFetch.fetch(input as never, init)
    }) as unknown as typeof globalThis.fetch
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    queryClient.setQueryData(orpcQuery.public.github.avatar.queryOptions({ input: {} }).queryKey, { avatar: null })
  })

  function renderDialog() {
    return renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <VersionDialog open={true} onOpenChange={noop} />
      </QueryClientProvider>,
    )
  }

  function enqueueCheck(result: UpdateCheckResult) {
    mockFetch.enqueue(/\/rpc\/admin\/update\/check$/, jsonResponse({ json: result }))
  }

  it('renders the idle prompt before any check', () => {
    renderDialog()
    expect(screen.getByText('点击上方按钮检查是否有新版本')).toBeInTheDocument()
  })

  it('shows up-to-date after a check with no newer release', async () => {
    mockFetch.enqueue(
      /\/rpc\/admin\/update\/check$/,
      jsonResponse({ json: checkResult({ updateAvailable: false, latestVersion: '6.4.0', tagName: 'v6.4.0' }) }),
    )
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('当前已是最新版本')).toBeInTheDocument())
  })

  it('shows an error when the check fails', async () => {
    enqueueCheckError(() => new Response('network down', { status: 500 }))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('检查失败，请稍后重试')).toBeInTheDocument())
  })

  it('offers 立即更新 with the confirm line when the deployment can self-update', async () => {
    enqueueCheck(checkResult())
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('发现新版本：')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument()
    expect(screen.getByText('将下载并替换当前二进制，随后自动重启')).toBeInTheDocument()
  })

  it('shows the gate reasons instead of 立即更新 when self-update is refused', async () => {
    enqueueCheck(
      checkResult({
        canSelfUpdate: false,
        reasons: [
          {
            messageKey: 'update.gate.containerized',
            fallbackMessage: 'Docker deployments must pull a new image to upgrade.',
          },
        ],
      }),
    )
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByText('Docker 部署请拉取新镜像升级。')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /立即更新/ })).not.toBeInTheDocument()
  })

  it('runs the apply flow and renders every job state', async () => {
    enqueueCheck(checkResult())
    mockFetch.enqueue(
      /\/rpc\/admin\/update\/apply$/,
      jsonResponse({ json: { fromVersion: '6.4.0', toVersion: '6.5.0' } }),
    )
    const view = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }))
    await waitFor(() => expect(mockFetch.calls.some(({ url }) => url.endsWith('/rpc/admin/update/apply'))).toBe(true))

    await waitFor(() => expect(screen.getByText('正在下载更新包…')).toBeInTheDocument())

    const statusKey = orpcQuery.admin.update.status.queryOptions({ input: {} }).queryKey
    const setJob = (status: UpdateJobStatus) => {
      statusNow.current = status
      queryClient.setQueryData(statusKey, status)
      view.rerender(
        wrapWithI18n(
          <QueryClientProvider client={queryClient}>
            <VersionDialog open={true} onOpenChange={noop} />
          </QueryClientProvider>,
        ),
      )
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
    enqueueCheck(checkResult())
    mockFetch.enqueue(/\/rpc\/admin\/update\/apply$/, () => new Response('conflict', { status: 409 }))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /检查更新/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /立即更新/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /立即更新/ }))
    await waitFor(() => expect(screen.getByText(/启动更新失败/)).toBeInTheDocument())
  })
})

function enqueueCheckError(response: () => Response) {
  mockFetch.enqueue(/\/rpc\/admin\/update\/check$/, response)
}

// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySettings } from '@/shared/config/types'
import type { ObservabilityStatusOutput } from '@/shared/contracts/observability'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { mergeSectionPatch } from '@/shared/config/merge-section-patch'

// One fake observability server behind the REAL react-query hooks: the orpc
// query/mutation surface is the only mocked boundary, while the card wiring
// (status gating, flush-before-test, invalidation) runs for real.
const api = vi.hoisted(() => ({
  status: undefined as ObservabilityStatusOutput | undefined,
  testConnection: vi.fn(),
  provision: vi.fn(),
}))

const commit = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))

vi.mock('@/client/api/orpc-query', () => {
  const statusKey = ['test', 'observability', 'status'] as const
  return {
    orpcQuery: {
      admin: {
        observability: {
          status: {
            key: () => statusKey,
            queryOptions: () => ({
              queryKey: statusKey,
              queryFn: () => Promise.resolve(api.status),
            }),
          },
          testConnection: {
            mutationOptions: () => ({ mutationFn: () => api.testConnection() }),
          },
          provision: {
            mutationOptions: () => ({ mutationFn: () => api.provision() }),
          },
        },
      },
    },
  }
})

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({ commit, isPending: false, status: 'idle' }),
}))

vi.mock('sonner', () => ({ toast, Toaster: () => null }))

import { ObservabilityForm } from '@/ui/admin/settings/ObservabilityForm'

const INITIAL: ObservabilitySettings = structuredClone(TEST_BLOG_SETTINGS_BUNDLE.observability!)

const PASSWORD_MASK = 'p4ss'
const TOKEN_MASK = 'tok3'

let server: ObservabilitySettings
let payloads: Array<Record<string, unknown>>
let calls: string[]

function makeStatus(overrides: Partial<ObservabilityStatusOutput> = {}): ObservabilityStatusOutput {
  return {
    runtime: { phase: 'unverified', lastError: null },
    verified: false,
    provisioned: false,
    provisionedCurrent: false,
    version: null,
    ...overrides,
  }
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    wrapWithI18n(
      <QueryClientProvider client={queryClient}>
        <ObservabilityForm observability={server} passwordMask={PASSWORD_MASK} rumClientTokenMask={TOKEN_MASK} />
      </QueryClientProvider>,
    ),
  )
}

function endpointInput(): HTMLInputElement {
  const input = document.getElementById('observability-endpoint')
  expect(input).not.toBeNull()
  return input as HTMLInputElement
}

function testButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '测试连接' }) as HTMLButtonElement
}

const successfulTestConnection = {
  ok: true as const,
  version: '0.14.0',
  organization: 'created' as const,
  provision: {
    status: 'succeeded' as const,
    organization: 'created' as const,
    rumToken: 'created' as const,
    pipeline: 'installed' as const,
    dashboards: 4,
    provisionedFingerprint: 'asset-fp',
  },
}

beforeEach(() => {
  server = structuredClone(INITIAL)
  payloads = []
  calls = []
  api.status = undefined
  api.testConnection.mockReset()
  api.provision.mockReset()
  commit.mockReset()
  for (const fn of [toast.error, toast.success, toast.warning]) {
    fn.mockReset()
  }
  commit.mockImplementation(async (_section: string, payload: Record<string, unknown>) => {
    calls.push('commit')
    payloads.push(payload)
    server = mergeSectionPatch(server, payload)
    return { ok: true, section: server }
  })
  api.testConnection.mockImplementation(async () => {
    calls.push('test')
    return successfulTestConnection
  })
})

describe('ui/admin/settings/ObservabilityForm', () => {
  it('renders the three cards, the stored masks and the saved endpoint', async () => {
    api.status = makeStatus({ verified: true, version: '0.14.0' })
    renderForm()

    expect(screen.getByText('OpenObserve 连接')).toBeTruthy()
    expect(screen.getByText('数据上报')).toBeTruthy()
    expect(screen.getByText('监控面板')).toBeTruthy()

    expect(endpointInput()).toHaveValue(INITIAL.observability.endpoint)
    // Password hint and the read-only RUM token both show the loader mask.
    expect(screen.getByText(/p4ss/)).toBeTruthy()
    expect(screen.getByText(/tok3/)).toBeTruthy()
    expect(await screen.findByText('连接已验证')).toBeTruthy()
  })

  it('disables every switch and the resync action until the connection is verified', async () => {
    api.status = makeStatus({ verified: false, provisioned: true })
    renderForm()

    expect(await screen.findByText('先完成连接测试后才能修改上报设置。')).toBeTruthy()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(4)
    for (const toggle of switches) {
      // Base UI's switch root is a span: the disabled state rides `aria-disabled`.
      expect(toggle.getAttribute('aria-disabled')).toBe('true')
    }
    expect(screen.getByRole('button', { name: '重新同步' })).toBeDisabled()
    // The switches keep showing the stored values — gating never rewrites them.
    expect(switches.map((toggle) => toggle.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
  })

  it('commits the dirty connection card BEFORE testing', async () => {
    api.status = makeStatus({ verified: true })
    renderForm()
    await screen.findByText('连接已验证')

    fireEvent.change(endpointInput(), { target: { value: 'https://obs.example.com' } })
    fireEvent.click(testButton())

    expect(await screen.findByText('连接测试通过')).toBeTruthy()
    // The test only sees saved settings: the sparse patch lands first.
    expect(payloads).toEqual([{ observability: { endpoint: 'https://obs.example.com' } }])
    expect(calls).toEqual(['commit', 'test'])
    expect(server.observability.endpoint).toBe('https://obs.example.com')
    expect(screen.getByText('OpenObserve 版本：0.14.0')).toBeTruthy()
    expect(screen.getByText('监控面板：4 个已就绪')).toBeTruthy()
  })

  it('skips the connection test when the pending save is rejected', async () => {
    api.status = makeStatus({ verified: true })
    commit.mockResolvedValueOnce({ ok: false })
    renderForm()
    await screen.findByText('连接已验证')

    fireEvent.change(endpointInput(), { target: { value: 'https://obs.example.com' } })
    fireEvent.click(testButton())

    expect(await screen.findByText('连接设置尚未保存成功，请修正后再测试。')).toBeTruthy()
    expect(api.testConnection).not.toHaveBeenCalled()
  })

  it('localizes a provision failure descriptor and points at the resync entry', async () => {
    api.status = makeStatus({ verified: true })
    api.testConnection.mockResolvedValueOnce({
      ...successfulTestConnection,
      provision: {
        status: 'failed',
        descriptor: {
          messageKey: 'admin.settings.observability.error.provisionFailed',
          fallbackMessage: 'The connection is verified, but the assets could not be synced',
        },
      },
    })
    renderForm()
    await screen.findByText('连接已验证')

    fireEvent.click(testButton())

    expect(await screen.findByText('连接已验证，但 OpenObserve 资产同步失败；请重试资产同步')).toBeTruthy()
    expect(screen.getByText('可在「监控面板」卡片点击「重新同步」重试资产同步。')).toBeTruthy()
    expect(document.body.textContent).not.toContain('admin.settings.observability.error.provisionFailed')
  })

  it('shows the runtime lastError as selectable text', async () => {
    api.status = makeStatus({
      verified: true,
      runtime: { phase: 'failed', lastError: 'OBS_CONFIG_INVALID:endpoint' },
    })
    renderForm()

    expect(await screen.findByText('运行失败')).toBeTruthy()
    expect(screen.getByText('OBS_CONFIG_INVALID:endpoint')).toBeTruthy()
  })

  it('runs the manual resync once verified and reports the created dashboards', async () => {
    api.status = makeStatus({ verified: true, provisioned: true, provisionedCurrent: false })
    api.provision.mockResolvedValue({
      organization: 'exists',
      rumToken: 'exists',
      pipeline: 'installed',
      dashboards: 4,
      provisionedFingerprint: 'asset-fp',
    })
    renderForm()

    expect(await screen.findByText('资产版本已过期，将随下次启动自动升级，或点击「重新同步」手动升级')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新同步' }))

    expect(await screen.findByText('监控面板：4 个已就绪')).toBeTruthy()
    expect(api.provision).toHaveBeenCalledTimes(1)
  })

  it('keeps the switches usable after a successful test flips the status', async () => {
    api.status = makeStatus({ verified: false })
    api.testConnection.mockImplementation(async () => {
      api.status = makeStatus({ verified: true })
      return successfulTestConnection
    })
    renderForm()

    expect(await screen.findByText('先完成连接测试后才能修改上报设置。')).toBeTruthy()
    fireEvent.click(testButton())

    await waitFor(() => expect(screen.queryByText('先完成连接测试后才能修改上报设置。')).toBeNull())
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle.getAttribute('aria-disabled')).toBeNull()
    }
  })
})

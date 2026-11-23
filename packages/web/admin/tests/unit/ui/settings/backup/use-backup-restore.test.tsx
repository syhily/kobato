// @vitest-environment happy-dom

import { tZhCN } from '@kobato/i18n/tests/utils/i18n'
import { renderHookWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import {
  waitForRestartAndReport,
  useBackupUploadRestore,
} from '@kobato/web-admin/ui/settings/backup/use-backup-restore'
import { act, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() })
  return { toast, Toaster: () => null }
})

import { toast } from 'sonner'
const toastMock = vi.mocked(toast)

const api = vi.hoisted(() => ({
  restoreProgress: vi.fn(),
  restoreStatus: vi.fn(),
  uploadRestoreDecrypt: vi.fn(),
}))

const apiClientMod = await import('@kobato/web-client/api/client')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(
  () =>
    ({
      admin: {
        backup: {
          restoreProgress: (input: unknown, options?: unknown) => api.restoreProgress(input, options),
          restoreStatus: (input: unknown, options?: unknown) => api.restoreStatus(input, options),
          uploadRestoreDecrypt: (input: unknown, options?: unknown) => api.uploadRestoreDecrypt(input, options),
        },
      },
    }) as never,
)

afterAll(() => {
  vi.restoreAllMocks()
})

class FakeXhr {
  status = 0
  responseText = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  upload = { onprogress: null }
  private url = ''

  open(_method: string, url: string): void {
    this.url = url
  }

  setRequestHeader(): void {}

  send(): void {
    queueMicrotask(() => {
      const body =
        this.url === '/rpc/admin/backup/uploadRestore' ? '{"json":{"encrypted":true,"token":"tok-1"}}' : '{"json":{}}'
      this.status = 200
      this.responseText = body
      this.onload?.()
    })
  }
}

async function parkedHook() {
  const hook = renderHookWithI18n(() => useBackupUploadRestore({ csrfToken: 'csrf' }))
  act(() => {
    hook.result.current.startUpload(new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))
  })
  await waitFor(() => expect(hook.result.current.state.pendingToken).toBe('tok-1'))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  api.restoreProgress.mockResolvedValue({ stage: 'idle', percent: null })
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBackupUploadRestore.submitPassword over oRPC', () => {
  it('hands the parked token to uploadRestoreDecrypt and enters the restart tail on acceptance', async () => {
    api.uploadRestoreDecrypt.mockResolvedValue({ accepted: true })
    const hook = await parkedHook()

    await act(async () => {
      hook.result.current.submitPassword('right-password')
    })

    await waitFor(() => expect(hook.result.current.state.step).toBe('switching'))
    expect(api.uploadRestoreDecrypt).toHaveBeenCalledWith(
      { token: 'tok-1', password: 'right-password' },
      { signal: expect.any(AbortSignal) },
    )
    expect(hook.result.current.state.pendingToken).toBeNull()
    expect(toastMock.error).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('resets the whole flow on a 410 wire rejection without probing the machine', async () => {
    api.uploadRestoreDecrypt.mockRejectedValue(
      Object.assign(new Error('上传会话已过期，请重新上传备份文件。'), { status: 410 }),
    )
    api.restoreProgress.mockRejectedValue(new Error('poll failed'))
    const hook = await parkedHook()

    await act(async () => {
      hook.result.current.submitPassword('any-password')
    })

    await waitFor(() => expect(hook.result.current.state.active).toBe(false))
    expect(toastMock.error).toHaveBeenCalledWith('还原失败', {
      description: '上传会话已过期，请重新上传备份文件。',
    })
    expect(toastMock.error).not.toHaveBeenCalledWith('上传还原失败', expect.anything())
    hook.unmount()
  })

  it('keeps the flow retryable on a wrong-password 400 — passwordPending clears, state stays active', async () => {
    api.uploadRestoreDecrypt.mockRejectedValue(Object.assign(new Error('备份密码错误或文件已损坏'), { status: 400 }))
    api.restoreProgress.mockRejectedValue(new Error('poll failed'))
    const hook = await parkedHook()

    await act(async () => {
      hook.result.current.submitPassword('wrong-password')
    })

    await waitFor(() => expect(hook.result.current.state.passwordPending).toBe(false))
    expect(hook.result.current.state.active).toBe(true)
    expect(hook.result.current.state.pendingToken).toBe('tok-1')
    expect(hook.result.current.state.step).toBe('decrypting')
    expect(toastMock.error).toHaveBeenCalledWith('还原失败', { description: '备份密码错误或文件已损坏' })
    expect(toastMock.error).not.toHaveBeenCalledWith('上传还原失败', expect.anything())
    hook.unmount()
  })

  it('recovers into the restart tail when the decrypt call drops without a wire status and the machine is already restoring', async () => {
    api.uploadRestoreDecrypt.mockRejectedValue(new Error('Failed to fetch'))
    api.restoreProgress.mockResolvedValue({ stage: 'draining', percent: null })
    const hook = await parkedHook()

    await act(async () => {
      hook.result.current.submitPassword('right-password')
    })

    await waitFor(() => expect(hook.result.current.state.step).toBe('switching'))
    expect(api.restoreProgress).toHaveBeenCalledWith(undefined, { signal: expect.any(AbortSignal) })
    expect(toastMock.error).not.toHaveBeenCalled()
    hook.unmount()
  })
})

describe('waitForRestartAndReport over oRPC', () => {
  const reload = vi.fn()

  beforeEach(() => {
    Object.defineProperty(window.location, 'reload', { configurable: true, writable: true, value: reload })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    )
  })

  it('reports the completed restore with the applied-config copy and reloads', async () => {
    api.restoreStatus.mockResolvedValue({ phase: 'completed', startedAt: '2026-01-01T00:00:00Z', configApplied: true })

    await expect(waitForRestartAndReport(new AbortController().signal, tZhCN)).resolves.toBe(true)
    expect(toastMock.success).toHaveBeenCalledWith('备份已还原；配置文件已替换，将在下次重启后生效')
    expect(reload).toHaveBeenCalled()
    expect(api.restoreStatus).toHaveBeenCalledWith(undefined, { signal: expect.any(AbortSignal) })
  })

  it('reports a failed restore through the error toast', async () => {
    api.restoreStatus.mockResolvedValue({
      phase: 'failed',
      startedAt: '2026-01-01T00:00:00Z',
      error: 'disk exploded',
    })

    await expect(waitForRestartAndReport(new AbortController().signal, tZhCN)).resolves.toBe(true)
    expect(toastMock.error).toHaveBeenCalledWith('还原失败', { description: 'disk exploded' })
    expect(reload).toHaveBeenCalled()
  })

  it('falls back to the service-recovered notice after five non-terminal status reads', async () => {
    vi.useFakeTimers()
    try {
      api.restoreStatus.mockResolvedValue({ phase: 'idle', startedAt: '' })
      const pending = waitForRestartAndReport(new AbortController().signal, tZhCN)
      await vi.advanceTimersByTimeAsync(0)
      for (let read = 0; read < 5; read++) {
        await vi.advanceTimersByTimeAsync(800)
      }
      await expect(pending).resolves.toBe(true)
      expect(toastMock).toHaveBeenCalledWith('服务已恢复，正在刷新页面')
      expect(api.restoreStatus).toHaveBeenCalledTimes(5)
      expect(reload).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

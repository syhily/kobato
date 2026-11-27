// @vitest-environment happy-dom

import { makeTranslator } from '@kobato/i18n/tests/utils/i18n'
import { useFileUpload, type UseFileUploadOptions } from '@kobato/web-admin/ui/shared/use-file-upload'
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const toastMock = vi.mocked(toast)
const t = makeTranslator('zh-CN')

function makeFile(name: string, size = 3): File {
  return new File([new Uint8Array(size)], name)
}

function options(overrides: Partial<UseFileUploadOptions> = {}): UseFileUploadOptions {
  return {
    t,
    submit: vi.fn(async () => ({ accepted: true })),
    accept: ['.svg'],
    maxBytes: 100,
    messages: {
      invalidType: { title: '文件类型错误', description: '请选择 .svg 格式的文件' },
      tooLarge: (file) => ({ title: `文件过大（${file.size} B）`, description: '大小上限为 100 B。' }),
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFileUpload — guards', () => {
  it('rejects an invalid extension before calling submit', async () => {
    const opts = options()
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.png')))).toBe(false)
    expect(opts.submit).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith('文件类型错误', { description: '请选择 .svg 格式的文件' })
  })

  it('matches extensions case-insensitively', async () => {
    const opts = options()
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.SVG')))).toBe(true)
  })

  it('rejects oversize files and runs the type guard first', async () => {
    const opts = options()
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg', 101)))).toBe(false)
    expect(toastMock.error).toHaveBeenLastCalledWith('文件过大（101 B）', { description: '大小上限为 100 B。' })
    expect(await act(() => result.current.upload(makeFile('x.png', 101)))).toBe(false)
    expect(toastMock.error).toHaveBeenLastCalledWith('文件类型错误', { description: '请选择 .svg 格式的文件' })
    expect(opts.submit).not.toHaveBeenCalled()
  })

  it('routes guard failures to onError with the description', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useFileUpload(options({ onError })))
    expect(await act(() => result.current.upload(makeFile('x.png')))).toBe(false)
    expect(onError).toHaveBeenCalledWith('请选择 .svg 格式的文件')
  })

  it('skips client guards for FormData and merges its fields', async () => {
    const opts = options({ fields: { slot: 'logo' } })
    const { result } = renderHook(() => useFileUpload(opts))
    const form = new FormData()
    form.set('file', makeFile('x.png', 200))
    form.set('password', 'secret')
    form.set('csrf_token', 'do-not-submit')
    expect(await act(() => result.current.upload(form))).toBe(true)
    expect(opts.submit).toHaveBeenCalledWith(expect.any(File), { slot: 'logo', password: 'secret' })
  })
})

describe('useFileUpload — submit lifecycle', () => {
  it('submits fields and file, toasts success, and passes the output to onSuccess', async () => {
    const output = { font: { id: 'f1' } }
    const opts = options({ submit: vi.fn(async () => output), fields: { slot: 'og' } })
    const onSuccess = vi.fn()
    opts.messages = { success: '上传成功' }
    opts.onSuccess = onSuccess
    const { result } = renderHook(() => useFileUpload(opts))
    const file = makeFile('x.svg')
    expect(await act(() => result.current.upload(file))).toBe(true)
    expect(opts.submit).toHaveBeenCalledWith(file, { slot: 'og' })
    expect(toastMock.success).toHaveBeenCalledWith('上传成功')
    expect(onSuccess).toHaveBeenCalledWith(output)
  })

  it('is pending while submit is in flight and clears it after success', async () => {
    let resolve!: (value: unknown) => void
    const opts = options({
      submit: vi.fn(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      ),
    })
    const { result } = renderHook(() => useFileUpload(opts))
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.upload(makeFile('x.svg'))
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      resolve({})
      await pending
    })
    expect(result.current.pending).toBe(false)
  })

  it('clears pending after a rejection', async () => {
    const opts = options({
      submit: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg')))).toBe(false)
    expect(result.current.pending).toBe(false)
  })

  it('surfaces an onSuccess throw through the error channel', async () => {
    const opts = options({
      onSuccess: () => {
        throw new Error('refresh failed')
      },
    })
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg')))).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: 'refresh failed' })
  })

  it('returns false and reports a missing FormData file', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useFileUpload(options({ onError })))
    expect(await act(() => result.current.upload(new FormData()))).toBe(false)
    expect(onError).toHaveBeenCalledWith('请上传文件')
  })
})

describe('useFileUpload — failures', () => {
  it('uses httpFailure for wire status errors in onError mode', async () => {
    const onError = vi.fn()
    const opts = options({
      submit: vi.fn(async () => {
        throw Object.assign(new Error('upstream'), { status: 502 })
      }),
      messages: { httpFailure: (status) => `服务器错误 (${status})` },
      onError,
    })
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg')))).toBe(false)
    expect(onError).toHaveBeenCalledWith('服务器错误 (502)')
  })

  it('toasts transport errors', async () => {
    const opts = options({
      submit: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg')))).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: 'offline' })
  })

  it('routes transport failures to onError', async () => {
    const onError = vi.fn()
    const opts = options({
      submit: vi.fn(async () => {
        throw new Error('offline')
      }),
      onError,
    })
    const { result } = renderHook(() => useFileUpload(opts))
    expect(await act(() => result.current.upload(makeFile('x.svg')))).toBe(false)
    expect(onError).toHaveBeenCalledWith('offline')
  })
})

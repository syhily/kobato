// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The hook reads the CSRF token via `useRouteLoaderData('root')`; a hoisted
// singleton lets each test toggle the token without standing up a router.
// sonner is stubbed so toast copy is asserted, not rendered.
const routerState = vi.hoisted(() => ({ csrfToken: 'test-csrf-token' as string | undefined }))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRouteLoaderData: () => (routerState.csrfToken === undefined ? undefined : { csrfToken: routerState.csrfToken }),
  }
})

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

const fetchMock = vi.hoisted(() => vi.fn())

import { useFileUpload, type UseFileUploadOptions } from '@/client/hooks/use-file-upload'

function makeFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Fetch init captured from the most recent call. */
function lastFetchInit(): RequestInit {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined
  if (init === undefined) {
    throw new Error('fetch was not called')
  }
  return init
}

beforeEach(() => {
  vi.clearAllMocks()
  routerState.csrfToken = 'test-csrf-token'
  vi.stubGlobal('fetch', fetchMock)
})

describe('useFileUpload — guards', () => {
  const options: UseFileUploadOptions = {
    endpoint: '/api/admin/example/upload',
    accept: ['.svg'],
    maxBytes: 100,
    messages: {
      invalidType: { title: '文件类型错误', description: '请选择 .svg 格式的文件' },
      tooLarge: (file) => ({
        title: `文件过大（${(file.size / 1024).toFixed(0)} KB）`,
        description: '大小上限为 100 B。',
      }),
    },
  }

  it('rejects a file whose extension is not accepted and never fetches', async () => {
    const { result } = renderHook(() => useFileUpload(options))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('icon.png', 10))
    })
    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('文件类型错误', { description: '请选择 .svg 格式的文件' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it('matches extensions case-insensitively', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useFileUpload(options))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('ICON.SVG', 10))
    })
    expect(ok).toBe(true)
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('rejects an oversize file and hands it to the tooLarge message factory', async () => {
    const { result } = renderHook(() => useFileUpload(options))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('icon.svg', 4096))
    })
    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('文件过大（4 KB）', { description: '大小上限为 100 B。' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runs the type guard before the size guard', async () => {
    const { result } = renderHook(() => useFileUpload(options))
    await act(async () => {
      await result.current.upload(makeFile('icon.png', 4096))
    })
    expect(toastMock.error).toHaveBeenCalledWith('文件类型错误', { description: '请选择 .svg 格式的文件' })
  })

  it('routes guard failures to onError (description preferred) when the channel is set', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useFileUpload({ ...options, onError }))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('icon.png', 10))
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledWith('请选择 .svg 格式的文件')
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips the guards for a prebuilt FormData and posts it through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const formData = new FormData()
    formData.append('file', makeFile('backup.sql', 10))
    formData.append('csrf_token', 'embedded')
    const { result } = renderHook(() => useFileUpload(options))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(formData)
    })
    expect(ok).toBe(true)
    expect(lastFetchInit().body).toBe(formData)
  })
})

describe('useFileUpload — request', () => {
  it('posts fields + file as multipart with the CSRF header and toasts success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const file = makeFile('icon.svg', 10)
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/admin/branding/upload',
        fields: { slot: 'faviconSvg' },
        messages: { success: 'Favicon SVG 已上传' },
      }),
    )
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(file)
    })
    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/branding/upload')
    const init = lastFetchInit()
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'x-csrf-token': 'test-csrf-token' })
    expect(init.credentials).toBeUndefined()
    const body = init.body as FormData
    expect(body.get('slot')).toBe('faviconSvg')
    expect(body.get('file')).toBe(file)
    expect(toastMock.success).toHaveBeenCalledWith('Favicon SVG 已上传')
  })

  it('omits the CSRF header when the root loader has no token', async () => {
    routerState.csrfToken = undefined
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(lastFetchInit().headers).toEqual({})
  })

  it('forwards the credentials mode when set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/setup/restore', credentials: 'include' }))
    await act(async () => {
      await result.current.upload(new FormData())
    })
    expect(lastFetchInit().credentials).toBe('include')
  })

  it('is pending while the request is in flight', async () => {
    let resolveFetch!: (res: Response) => void
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    expect(result.current.pending).toBe(false)
    let ok!: boolean
    let promise!: Promise<boolean>
    act(() => {
      promise = result.current.upload(makeFile('a.bin', 1))
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      resolveFetch(jsonResponse({}))
      ok = await promise
    })
    expect(ok).toBe(true)
    expect(result.current.pending).toBe(false)
  })

  it('clears pending after a failure too', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(result.current.pending).toBe(false)
  })
})

describe('useFileUpload — success handling', () => {
  it('awaits onSuccess after the success toast', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const order: string[] = []
    toastMock.success.mockImplementation(() => {
      order.push('toast')
    })
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/admin/example/upload',
        messages: { success: '已上传' },
        onSuccess: async () => {
          order.push('onSuccess')
        },
      }),
    )
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(order).toEqual(['toast', 'onSuccess'])
  })

  it('surfaces an onSuccess throw through the toast channel with the error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/admin/example/upload',
        onSuccess: () => {
          throw new Error('revalidate blew up')
        },
      }),
    )
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('a.bin', 1))
    })
    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: 'revalidate blew up' })
  })

  it('passes the parsed body to onSuccess when parseJson is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }))
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/setup/restore', parseJson: true, onSuccess }))
    await act(async () => {
      await result.current.upload(new FormData())
    })
    expect(onSuccess).toHaveBeenCalledWith({ accepted: true })
    expect(toastMock.success).not.toHaveBeenCalled()
  })
})

describe('useFileUpload — failure handling', () => {
  it('unwraps the server error envelope and toasts its message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: '存储后端不可用' } }, 502))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('a.bin', 1))
    })
    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: '存储后端不可用' })
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('falls back to 上传失败 (<status>) when the error body has no message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 413))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: '上传失败 (413)' })
  })

  it('falls back when the error body is not JSON at all', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: '上传失败 (502)' })
  })

  it('routes HTTP failures to onError when the channel is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: '恢复失败，请检查备份文件后重试。' } }, 400))
    const onError = vi.fn()
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/setup/restore', parseJson: true, onError }))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(new FormData())
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledWith('恢复失败，请检查备份文件后重试。')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('uses the httpFailure override when the server message is missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500))
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/setup/restore',
        parseJson: true,
        messages: { httpFailure: () => '恢复失败，请检查备份文件后重试。' },
        onError,
      }),
    )
    await act(async () => {
      await result.current.upload(new FormData())
    })
    expect(onError).toHaveBeenCalledWith('恢复失败，请检查备份文件后重试。')
  })

  it('toasts the transport error message when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(makeFile('a.bin', 1))
    })
    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: 'Failed to fetch' })
  })

  it('toasts the failure fallback for non-Error throws', async () => {
    fetchMock.mockRejectedValue('boom')
    const { result } = renderHook(() => useFileUpload({ endpoint: '/api/admin/example/upload' }))
    await act(async () => {
      await result.current.upload(makeFile('a.bin', 1))
    })
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: 'boom' })
  })

  it('routes transport failures to the failure fallback in onError mode', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/setup/restore',
        messages: { failure: '网络错误，请稍后重试。' },
        onError,
      }),
    )
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(new FormData())
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledWith('网络错误，请稍后重试。')
  })

  it('treats a malformed JSON body as a transport failure when parseJson is set', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 502 }))
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useFileUpload({
        endpoint: '/api/setup/restore',
        parseJson: true,
        messages: { httpFailure: () => '恢复失败，请检查备份文件后重试。', failure: '网络错误，请稍后重试。' },
        onError,
      }),
    )
    let ok!: boolean
    await act(async () => {
      ok = await result.current.upload(new FormData())
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledWith('网络错误，请稍后重试。')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

// sonner is stubbed so toast copy is asserted, not rendered.
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { onMutationError, toastApiError } from '@/client/lib/toast-api-error'

describe('onMutationError', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
  })

  it('returns an onError handler that toasts through toastApiError', () => {
    const onError = onMutationError('保存失败')
    onError(new Error('服务器内部错误'))
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', { description: '服务器内部错误' })
  })
})

describe('toastApiError', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
  })

  it('prefers the `{ error: { message } }` wire body over everything else', () => {
    toastApiError({ error: { message: '存储后端不可用' } }, '上传失败')
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: '存储后端不可用' })
  })

  it('uses the Error message as description for oRPC/HTTP rejections', () => {
    // ORPCError rejections are Error instances whose .message is the server copy.
    toastApiError(new Error('请求过于频繁，请稍后再试。'), '操作失败')
    expect(toastMock.error).toHaveBeenCalledWith('操作失败', { description: '请求过于频繁，请稍后再试。' })
  })

  it('uses the Error message as description for network failures', () => {
    toastApiError(new TypeError('Failed to fetch'), '加载列表失败')
    expect(toastMock.error).toHaveBeenCalledWith('加载列表失败', { description: 'Failed to fetch' })
  })

  it('uses a bare string as description', () => {
    toastApiError('磁盘已满', '还原失败')
    expect(toastMock.error).toHaveBeenCalledWith('还原失败', { description: '磁盘已满' })
  })

  it('renders title only for unknown shapes', () => {
    toastApiError(undefined, '保存失败')
    toastApiError(null, '保存失败')
    toastApiError(42, '保存失败')
    toastApiError({ code: 'E123' }, '保存失败')
    expect(toastMock.error).toHaveBeenCalledTimes(4)
    for (const call of toastMock.error.mock.calls) {
      expect(call).toEqual(['保存失败'])
    }
  })

  it('treats empty messages as no description', () => {
    const emptyError = new Error('placeholder')
    emptyError.message = ''
    toastApiError(emptyError, '保存失败')
    toastApiError('', '保存失败')
    expect(toastMock.error).toHaveBeenCalledTimes(2)
    for (const call of toastMock.error.mock.calls) {
      expect(call).toEqual(['保存失败'])
    }
  })

  it('never promotes err.message into the title', () => {
    toastApiError(new Error('boom'), '删除失败')
    const [title] = toastMock.error.mock.calls[0] as [string]
    expect(title).toBe('删除失败')
  })
})

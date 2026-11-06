import { ORPCError } from '@orpc/client'
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

  it('appends an ORPCError zod-issue list so the failing field is named', () => {
    // The settings save path: DomainError('BAD_REQUEST', '设置数据无效', issues)
    // rides the ORPCError data channel as [{ message, path }].
    const err = new ORPCError('BAD_REQUEST', {
      message: '设置数据无效',
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resourceIp', 'maxAttempts'] }],
    })
    toastApiError(err, '保存失败')
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', {
      description: '设置数据无效：resourceIp.maxAttempts：最大尝试次数不能超过 1000',
    })
  })

  it('joins multiple issues and tolerates a missing path', () => {
    const err = new ORPCError('BAD_REQUEST', {
      message: '设置数据无效',
      data: [{ message: '时间窗口不能小于 60 秒', path: ['signInIp', 'windowSeconds'] }, { message: '格式错误' }],
    })
    toastApiError(err, '保存失败')
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', {
      description: '设置数据无效：signInIp.windowSeconds：时间窗口不能小于 60 秒；格式错误',
    })
  })

  it('ignores non-issue data payloads', () => {
    const err = new ORPCError('CONFLICT', { message: '存储迁移进行中', data: { retry: true } })
    toastApiError(err, '保存失败')
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', { description: '存储迁移进行中' })
  })
})

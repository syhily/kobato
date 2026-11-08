import { ORPCError } from '@orpc/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// sonner is stubbed so toast copy is asserted, not rendered.
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { makeTranslator } from '#/_helpers/i18n'
import { onMutationError, toastApiError } from '@/client/lib/toast-api-error'

const tZhCN = makeTranslator('zh-CN')
const tEnUS = makeTranslator('en-US')

describe('onMutationError', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
  })

  it('returns an onError handler that toasts the translated title through toastApiError', () => {
    const onError = onMutationError('admin.toast.saveFailed', tZhCN)
    onError(new Error('服务器内部错误'))
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', { description: '服务器内部错误' })
  })

  it('translates the same id for another locale', () => {
    onMutationError('admin.toast.saveFailed', tEnUS)(new Error('boom'))
    expect(toastMock.error).toHaveBeenCalledWith('Save failed', { description: 'boom' })
  })

  it('fills ICU params of the title', () => {
    onMutationError('admin.toast.listLoadFailed', tZhCN, { noun: tZhCN('admin.list.noun.tags') })('boom')
    expect(toastMock.error).toHaveBeenCalledWith('加载标签列表失败', { description: 'boom' })
  })
})

describe('toastApiError', () => {
  beforeEach(() => {
    toastMock.error.mockClear()
  })

  it('prefers the `{ error: { message } }` wire body over everything else', () => {
    toastApiError({ error: { message: '存储后端不可用' } }, 'admin.toast.uploadFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('上传失败', { description: '存储后端不可用' })
  })

  it('uses the Error message as description for oRPC/HTTP rejections', () => {
    // ORPCError rejections are Error instances whose .message is the server copy.
    toastApiError(new Error('请求过于频繁，请稍后再试。'), 'admin.toast.operationFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('操作失败', { description: '请求过于频繁，请稍后再试。' })
  })

  it('uses the Error message as description for network failures', () => {
    toastApiError(new TypeError('Failed to fetch'), 'admin.toast.listLoadFailed', tEnUS, {
      noun: tEnUS('admin.list.noun.users'),
    })
    expect(toastMock.error).toHaveBeenCalledWith('Failed to load the users list', {
      description: 'Failed to fetch',
    })
  })

  it('uses a bare string as description', () => {
    toastApiError('磁盘已满', 'admin.toast.restoreFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('还原失败', { description: '磁盘已满' })
  })

  it('renders title only for unknown shapes', () => {
    toastApiError(undefined, 'admin.toast.saveFailed', tZhCN)
    toastApiError(null, 'admin.toast.saveFailed', tZhCN)
    toastApiError(42, 'admin.toast.saveFailed', tZhCN)
    toastApiError({ code: 'E123' }, 'admin.toast.saveFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledTimes(4)
    for (const call of toastMock.error.mock.calls) {
      expect(call).toEqual(['保存失败'])
    }
  })

  it('treats empty messages as no description', () => {
    const emptyError = new Error('placeholder')
    emptyError.message = ''
    toastApiError(emptyError, 'admin.toast.saveFailed', tZhCN)
    toastApiError('', 'admin.toast.saveFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledTimes(2)
    for (const call of toastMock.error.mock.calls) {
      expect(call).toEqual(['保存失败'])
    }
  })

  it('never promotes err.message into the title', () => {
    toastApiError(new Error('boom'), 'admin.toast.deleteFailed', tZhCN)
    const [title] = toastMock.error.mock.calls[0] as [string]
    expect(title).toBe('删除失败')
  })

  it('never retranslates the server description — only the title is localized', () => {
    // A server body that happens to equal a catalog value stays verbatim.
    toastApiError(new Error('保存失败'), 'admin.toast.saveFailed', tEnUS)
    expect(toastMock.error).toHaveBeenCalledWith('Save failed', { description: '保存失败' })
  })

  it('toasts a descriptor ORPCError message verbatim — issues are folded server-side', () => {
    // Descriptor rejections ship a request-locale message with the issue
    // summary already folded in by the server; the toast never inspects `data`.
    const err = new ORPCError('BAD_REQUEST', {
      message: '设置数据无效：resource.maxAttempts：最大尝试次数不能超过 1000',
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
        issues: [
          {
            messageKey: 'admin.settings.rateLimit.error.maxAttempts',
            fallbackMessage: 'The maximum attempts must not exceed 1000',
            path: ['resource', 'maxAttempts'],
          },
        ],
      },
    })
    toastApiError(err, 'admin.toast.saveFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', {
      description: '设置数据无效：resource.maxAttempts：最大尝试次数不能超过 1000',
    })
  })

  it('uses a legacy bare-array rejection’s server message as-is (no client folding)', () => {
    const err = new ORPCError('BAD_REQUEST', {
      message: '设置数据无效',
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })
    toastApiError(err, 'admin.toast.saveFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', { description: '设置数据无效' })
  })

  it('ignores non-issue data payloads', () => {
    const err = new ORPCError('CONFLICT', { message: '存储迁移进行中', data: { retry: true } })
    toastApiError(err, 'admin.toast.saveFailed', tZhCN)
    expect(toastMock.error).toHaveBeenCalledWith('保存失败', { description: '存储迁移进行中' })
  })
})

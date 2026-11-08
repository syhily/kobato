import { describe, expect, it } from 'vitest'

import {
  enrichApiErrorMessage,
  extractApiErrorMessage,
  formatApiErrorIssues,
  isApiAccepted,
} from '@/shared/utils/api-error'

describe('extractApiErrorMessage', () => {
  it('returns undefined for non-object inputs', () => {
    expect(extractApiErrorMessage('error')).toBeUndefined()
    expect(extractApiErrorMessage(42)).toBeUndefined()
    expect(extractApiErrorMessage(null)).toBeUndefined()
  })

  it('returns undefined when the payload has no error field', () => {
    expect(extractApiErrorMessage({ success: false })).toBeUndefined()
  })

  it('returns undefined when error is not an object', () => {
    expect(extractApiErrorMessage({ error: 'oops' })).toBeUndefined()
  })

  it('returns undefined when error has no message', () => {
    expect(extractApiErrorMessage({ error: { code: 'E123' } })).toBeUndefined()
  })

  it('returns the message when present', () => {
    expect(extractApiErrorMessage({ error: { message: 'Something went wrong' } })).toBe('Something went wrong')
  })

  it('ignores non-string messages', () => {
    expect(extractApiErrorMessage({ error: { message: 123 } })).toBeUndefined()
  })
})

describe('isApiAccepted', () => {
  it('returns false for non-object inputs', () => {
    expect(isApiAccepted(undefined)).toBe(false)
    expect(isApiAccepted('accepted')).toBe(false)
    expect(isApiAccepted(null)).toBe(false)
  })

  it('returns false when accepted is missing or not true', () => {
    expect(isApiAccepted({})).toBe(false)
    expect(isApiAccepted({ accepted: false })).toBe(false)
    expect(isApiAccepted({ accepted: 'true' })).toBe(false)
  })

  it('returns true when accepted is exactly true', () => {
    expect(isApiAccepted({ accepted: true })).toBe(true)
  })
})

describe('formatApiErrorIssues', () => {
  it('returns undefined for non-object inputs and missing data', () => {
    expect(formatApiErrorIssues('error')).toBeUndefined()
    expect(formatApiErrorIssues(null)).toBeUndefined()
    expect(formatApiErrorIssues(new Error('boom'))).toBeUndefined()
  })

  it('returns undefined when data is not an array or holds no issues', () => {
    expect(formatApiErrorIssues({ data: { retry: true } })).toBeUndefined()
    expect(formatApiErrorIssues({ data: [] })).toBeUndefined()
    expect(formatApiErrorIssues({ data: [{ code: 'E123' }, { message: '' }] })).toBeUndefined()
  })

  it('formats a single issue with its dotted path', () => {
    // The settings save path: DomainError('BAD_REQUEST', '设置数据无效', issues)
    // rides the ORPCError data channel as [{ message, path }].
    const err = Object.assign(new Error('设置数据无效'), {
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })
    expect(formatApiErrorIssues(err)).toBe('resource.maxAttempts：最大尝试次数不能超过 1000')
  })

  it('ignores the descriptor-based data payload (the server already folded the summary)', () => {
    const err = Object.assign(new Error('设置数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒'), {
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
        issues: [
          {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            params: { min: 60 },
            fallbackMessage: 'The time window must be at least 60 seconds',
            path: ['signIn', 'windowSeconds'],
          },
        ],
      },
    })
    expect(formatApiErrorIssues(err)).toBeUndefined()
    enrichApiErrorMessage(err)
    expect(err.message).toBe('设置数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒')
  })

  it('joins multiple issues, tolerates a missing path, and drops malformed entries', () => {
    const err = Object.assign(new Error('设置数据无效'), {
      data: [
        { message: '时间窗口不能小于 60 秒', path: ['signIn', 'windowSeconds'] },
        { message: '格式错误' },
        { message: '路径被忽略', path: 'not-an-array' },
      ],
    })
    expect(formatApiErrorIssues(err)).toBe('signIn.windowSeconds：时间窗口不能小于 60 秒；格式错误')
  })
})

describe('enrichApiErrorMessage', () => {
  it('appends the issue detail to the message of an Error carrying issues', () => {
    const err = Object.assign(new Error('设置数据无效'), {
      data: [{ message: '最大尝试次数不能超过 1000', path: ['resource', 'maxAttempts'] }],
    })
    enrichApiErrorMessage(err)
    expect(err.message).toBe('设置数据无效：resource.maxAttempts：最大尝试次数不能超过 1000')
  })

  it('leaves non-Error inputs and issue-less errors untouched', () => {
    expect(() => enrichApiErrorMessage('boom')).not.toThrow()
    const plain = new Error('存储迁移进行中')
    enrichApiErrorMessage(plain)
    expect(plain.message).toBe('存储迁移进行中')
  })
})

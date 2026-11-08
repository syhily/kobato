import { describe, expect, it } from 'vitest'

import { apiErrorDescriptorKey, extractApiErrorMessage, isApiAccepted } from '@/shared/utils/api-error'

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

  it('keeps the legacy message-only response readable', () => {
    // A pre-descriptor server answered `{ error: { code, message } }` with no
    // issues and no descriptor; the top-level message stays the display copy.
    expect(extractApiErrorMessage({ error: { code: 'INTERNAL_SERVER_ERROR', message: '旧服务器消息' } })).toBe(
      '旧服务器消息',
    )
    // Legacy issues without a `message` field do not disturb the reader.
    expect(
      extractApiErrorMessage({
        error: { message: 'bad', issues: [{ messageKey: 'error.api.rawMessage', fallbackMessage: 'bad' }] },
      }),
    ).toBe('bad')
  })

  it('reads the folded message from the current descriptor wire shape', () => {
    expect(
      extractApiErrorMessage({
        error: {
          code: 'BAD_REQUEST',
          message: 'The settings data is invalid: signIn.windowSeconds: The time window must be at least 60 seconds',
          descriptor: { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
          issues: [
            {
              messageKey: 'admin.settings.rateLimit.error.windowMin',
              params: { min: 60 },
              fallbackMessage: 'The time window must be at least 60 seconds',
              message: 'The time window must be at least 60 seconds',
              path: ['signIn', 'windowSeconds'],
            },
          ],
        },
      }),
    ).toContain('The time window must be at least 60 seconds')
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

describe('apiErrorDescriptorKey', () => {
  it('reads the stable message key from a descriptor rejection (backup password flow)', () => {
    const error = Object.assign(new Error('The backup password is incorrect or the file is corrupted.'), {
      data: {
        descriptor: {
          messageKey: 'backup.error.passwordWrong',
          fallbackMessage: 'The backup password is incorrect or the file is corrupted.',
        },
      },
    })
    expect(apiErrorDescriptorKey(error)).toBe('backup.error.passwordWrong')
  })

  it('returns undefined for legacy raw/array-data rejections', () => {
    expect(apiErrorDescriptorKey(Object.assign(new Error('legacy'), { data: [{ message: 'x' }] }))).toBeUndefined()
    expect(apiErrorDescriptorKey(new Error('legacy'))).toBeUndefined()
    expect(apiErrorDescriptorKey('nope')).toBeUndefined()
    expect(apiErrorDescriptorKey(Object.assign(new Error('x'), { data: { issues: [] } }))).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import {
  apiErrorData,
  summarizeApiError,
  translateApiError,
  translateDomainError,
  type ApiErrorInput,
} from '@/server/http/translate-domain-error'
import { ActionFailure, DomainError, ErrorMessages, type DomainErrorIssue } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'

describe('server/http/translate-domain-error — translateDomainError', () => {
  it('maps a legacy DomainError to its status, code and passthrough descriptor', () => {
    const translated = translateDomainError(new DomainError('BAD_REQUEST', 'bad patch'))
    expect(translated).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'bad patch',
      descriptor: { messageKey: 'error.api.rawMessage', params: { message: 'bad patch' } },
    })
    expect(translated.issues).toBeUndefined()
    expect(translated.headers).toBeUndefined()
  })

  it('uses the DomainError default descriptor, English without a translator', () => {
    const translated = translateDomainError(new DomainError('NOT_FOUND'))
    expect(translated.status).toBe(404)
    expect(translated.message).toBe('Resource not found.')
    expect(translated.descriptor).toEqual({ messageKey: 'error.api.notFound', fallbackMessage: 'Resource not found.' })
  })

  it('localizes a descriptor when a translator is supplied', () => {
    const zh = translateDomainError(new DomainError('NOT_FOUND'), createServerTranslator('zh-CN'))
    expect(zh.message).toBe('资源不存在。')
    const en = translateDomainError(new DomainError('NOT_FOUND'), createServerTranslator('en-US'))
    expect(en.message).toBe('Resource not found.')
  })

  it('resolves the same generic descriptor in all four locales', () => {
    const expected: Record<AppLocale, string> = {
      'en-US': 'Resource not found.',
      'zh-CN': '资源不存在。',
      'zh-TW': '資源不存在。',
      'zh-HK': '資源不存在。',
    }
    for (const [locale, message] of Object.entries(expected)) {
      const translated = translateDomainError(new DomainError('NOT_FOUND'), createServerTranslator(locale as AppLocale))
      expect(translated.message).toBe(message)
    }
  })

  it('resolves a parameterized settings descriptor in all four locales', () => {
    const expected: Record<AppLocale, string> = {
      'en-US': 'The time window must be at least 60 seconds',
      'zh-CN': '时间窗口不能小于 60 秒',
      'zh-TW': '時間視窗不能小於 60 秒',
      'zh-HK': '時間視窗不能小於 60 秒',
    }
    for (const [locale, message] of Object.entries(expected)) {
      const translated = translateApiError(
        {
          status: 400,
          code: 'BAD_REQUEST',
          message: {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            params: { min: 60 },
            fallbackMessage: 'The time window must be at least 60 seconds',
          },
        },
        createServerTranslator(locale as AppLocale),
      )
      expect(translated.message).toBe(message)
    }
  })

  it('maps every DomainError code through domainStatus', () => {
    expect(translateDomainError(new DomainError('RATE_LIMITED')).status).toBe(429)
    expect(translateDomainError(new DomainError('CONFLICT')).status).toBe(409)
    expect(translateDomainError(new DomainError('INTERNAL')).status).toBe(500)
  })

  it('forwards ActionFailure status, descriptor, issues, headers and the guard code', () => {
    const headers = { 'Retry-After': '30' }
    const translated = translateDomainError(
      new ActionFailure(429, ErrorMessages.INVALID_INPUT, [{ message: 'dup', code: 'custom' }], headers),
    )
    expect(translated).toMatchObject({
      status: 429,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid input data',
      descriptor: { messageKey: 'error.api.invalidInput' },
      headers,
    })
    expect(translated.issues).toEqual([
      {
        messageKey: 'error.api.rawMessage',
        params: { message: 'dup' },
        fallbackMessage: 'dup',
        message: 'dup',
        code: 'custom',
      },
    ])
  })

  it('leaves issues and headers undefined for a bare ActionFailure', () => {
    const translated = translateDomainError(new ActionFailure(503, 'upload disabled'))
    expect(translated).toMatchObject({ status: 503, message: 'upload disabled', code: 'INTERNAL_SERVER_ERROR' })
    expect(translated.issues).toBeUndefined()
    expect(translated.headers).toBeUndefined()
  })

  it('keeps descriptor issues structured and adds the request-locale message', () => {
    const issue: DomainErrorIssue = {
      messageKey: 'admin.settings.rateLimit.error.attemptsMax',
      params: { max: 1000 },
      fallbackMessage: 'The maximum attempts must not exceed 1000',
      code: 'too_big',
      path: ['like', 'maxAttempts'],
    }
    const en = translateDomainError(
      new DomainError('BAD_REQUEST', ErrorMessages.INVALID_INPUT, [issue]),
      createServerTranslator('en-US'),
    )
    expect(en.issues?.[0]).toEqual({
      messageKey: 'admin.settings.rateLimit.error.attemptsMax',
      params: { max: 1000 },
      fallbackMessage: 'The maximum attempts must not exceed 1000',
      message: 'The maximum attempts must not exceed 1000',
      code: 'too_big',
      path: ['like', 'maxAttempts'],
    })

    const expected: Record<AppLocale, string> = {
      'en-US': 'The maximum attempts must not exceed 1000',
      'zh-CN': '最大尝试次数不能超过 1000',
      'zh-TW': '最大嘗試次數不能超過 1000',
      'zh-HK': '最大嘗試次數不能超過 1000',
    }
    for (const [locale, message] of Object.entries(expected)) {
      const translated = translateDomainError(
        new DomainError('BAD_REQUEST', ErrorMessages.INVALID_INPUT, [issue]),
        createServerTranslator(locale as AppLocale),
      )
      const wire = translated.issues![0]!
      expect(wire.message).toBe(message)
      // Old consumers read `message`; the descriptor stays for new consumers.
      expect(wire.messageKey).toBe('admin.settings.rateLimit.error.attemptsMax')
      expect(wire.params).toEqual({ max: 1000 })
      expect(wire.fallbackMessage).toBe(expected['en-US'])
      expect(wire.message).not.toBe(wire.messageKey)
    }
  })

  it('never puts a retired catalog key on the wire as the issue message', () => {
    const retired = {
      messageKey: 'retired.catalog.key',
      fallbackMessage: 'Retired English copy.',
      path: ['field'],
    } as unknown as DomainErrorIssue
    const translated = translateDomainError(
      new DomainError('BAD_REQUEST', ErrorMessages.INVALID_INPUT, [retired]),
      createServerTranslator('zh-CN'),
    )
    expect(translated.issues?.[0]).toMatchObject({
      messageKey: 'retired.catalog.key',
      fallbackMessage: 'Retired English copy.',
      message: 'Retired English copy.',
      path: ['field'],
    })
  })
})

describe('server/http/translate-domain-error — summarizeApiError', () => {
  it('returns the bare message when there are no issues', () => {
    const translator = createServerTranslator('en-US')
    expect(summarizeApiError(translateApiError({ status: 400, code: 'X', message: 'bad' }), translator)).toBe('bad')
  })

  it('joins localized issues with the locale separator and paths', () => {
    const input: ApiErrorInput = {
      status: 400,
      code: 'BAD_REQUEST',
      message: {
        messageKey: 'admin.settings.errors.invalid' as const,
        fallbackMessage: 'The settings data is invalid',
      },
      issues: [
        {
          messageKey: 'admin.settings.rateLimit.error.windowMin' as const,
          params: { min: 60 },
          fallbackMessage: 'The time window must be at least 60 seconds',
          path: ['signIn', 'windowSeconds'],
        },
        {
          messageKey: 'admin.settings.rateLimit.error.attemptsMax' as const,
          params: { max: 1000 },
          fallbackMessage: 'The maximum attempts must not exceed 1000',
          path: ['signIn', 'maxAttempts'],
        },
        { messageKey: 'error.api.rawMessage' as const, params: { message: 'orphan' }, fallbackMessage: 'orphan' },
      ],
    }

    const en = createServerTranslator('en-US')
    expect(summarizeApiError(translateApiError(input, en), en)).toBe(
      'The settings data is invalid: signIn.windowSeconds: The time window must be at least 60 seconds; ' +
        'signIn.maxAttempts: The maximum attempts must not exceed 1000; orphan',
    )

    const zhTW = createServerTranslator('zh-TW')
    expect(summarizeApiError(translateApiError(input, zhTW), zhTW)).toBe(
      '設定資料無效：signIn.windowSeconds：時間視窗不能小於 60 秒；signIn.maxAttempts：最大嘗試次數不能超過 1000；orphan',
    )
  })
})

describe('server/http/translate-domain-error — apiErrorData', () => {
  it('always carries the descriptor and only adds issues when present', () => {
    const bare = translateApiError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: ErrorMessages.INTERNAL_SERVER_ERROR,
    })
    expect(apiErrorData(bare)).toEqual({
      descriptor: { messageKey: 'error.api.internal', fallbackMessage: 'Internal server error' },
    })

    const issued = translateApiError({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'bad',
      issues: [{ message: 'dup' }],
    })
    expect(apiErrorData(issued)).toEqual({
      descriptor: { messageKey: 'error.api.rawMessage', params: { message: 'bad' }, fallbackMessage: 'bad' },
      issues: [
        {
          messageKey: 'error.api.rawMessage',
          params: { message: 'dup' },
          fallbackMessage: 'dup',
          message: 'dup',
        },
      ],
    })
  })
})

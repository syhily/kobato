import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { AppLocale } from '@/shared/i18n/locales'

import { makeRequestContext } from '#/_helpers/request-context'
import { onErrorHandler } from '@/server/http/errors'
import { ActionFailure, DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { rateLimitBucketMessages } from '@/shared/config/rate-limit-bucket'

interface ErrorBody {
  error: {
    code: string
    message: string
    descriptor: { messageKey: string; params?: Record<string, unknown>; fallbackMessage: string }
    issues?: {
      message: string
      messageKey: string
      params?: Record<string, unknown>
      fallbackMessage: string
      code?: string
      path?: string[]
    }[]
  }
}

async function run(
  err: Error,
  options: { locale?: AppLocale } = {},
): Promise<{
  status: number
  body: ErrorBody
  requestIdHeader: string | null
  header: (name: string) => string | null
}> {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('requestId' as never, 'req-1' as never)
    // The real perimeter derives this before any route runs; the early-error
    // unit shapes set it explicitly so the locale is deterministic.
    c.set(
      'requestContext' as never,
      makeRequestContext({
        localization: {
          locale: options.locale ?? 'zh-CN',
          timeZone: 'UTC',
          timeFormat: null,
          revision: 'boot-test:0000000000',
        },
      }) as never,
    )
    await next()
  })
  app.get('/', () => {
    throw err
  })
  app.onError((e, c) => onErrorHandler(e, c as never))
  const res = await app.request('/')
  return {
    status: res.status,
    body: (await res.json()) as ErrorBody,
    requestIdHeader: res.headers.get('X-Request-Id'),
    header: (name) => res.headers.get(name),
  }
}

/** A Zod failure whose issue message is a catalog id (typed validation copy). */
function zodErrorOf(): z.ZodError {
  const schema = z.object({ windowSeconds: z.coerce.number().min(60, rateLimitBucketMessages.windowMin) })
  try {
    schema.parse({ windowSeconds: 59 })
  } catch (error) {
    return error as z.ZodError
  }
  throw new Error('expected a ZodError')
}

describe('server/http/errors — onErrorHandler', () => {
  it('returns the HTTPException status, code and legacy message', async () => {
    const res = await run(new HTTPException(401, { message: 'nope' }))
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
    expect(res.body.error.message).toBe('nope')
    expect(res.body.error.descriptor).toMatchObject({
      messageKey: 'error.api.rawMessage',
      params: { message: 'nope' },
      fallbackMessage: 'nope',
    })
    expect(res.body.error.issues).toBeUndefined()
    expect(res.requestIdHeader).toBe('req-1')
  })

  it('maps an HTTPException cause into structured issues', async () => {
    const res = await run(new HTTPException(400, { message: 'bad', cause: [{ message: 'invalid' }] }))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.issues).toHaveLength(1)
    expect(res.body.error.issues?.[0]).toMatchObject({
      messageKey: 'error.api.rawMessage',
      params: { message: 'invalid' },
      fallbackMessage: 'invalid',
      message: 'invalid',
    })
    // The server folds the localized issues into the top-level message.
    expect(res.body.error.message).toBe('bad：invalid')
  })

  it('translates an ActionFailure descriptor and keeps its issues on the wire', async () => {
    const res = await run(new ActionFailure(429, ErrorMessages.INVALID_INPUT, [{ message: 'dup', path: ['a'] }]))
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR')
    expect(res.body.error.message).toBe('输入数据无效：a：dup')
    expect(res.body.error.descriptor.messageKey).toBe('error.api.invalidInput')
    expect(res.body.error.issues?.[0]).toMatchObject({
      messageKey: 'error.api.rawMessage',
      fallbackMessage: 'dup',
      message: 'dup',
      path: ['a'],
    })
  })

  it('appends ActionFailure headers onto the response', async () => {
    const res = await run(new ActionFailure(429, 'slow down', undefined, { 'X-RateLimit': '100' }))
    expect(res.status).toBe(429)
    expect(res.header('X-RateLimit')).toBe('100')
    expect(res.body.error.message).toBe('slow down')
  })

  it('translates the DomainError default descriptor for the request locale', async () => {
    const zh = await run(new DomainError('NOT_FOUND'))
    expect(zh.status).toBe(404)
    expect(zh.body.error.code).toBe('NOT_FOUND')
    expect(zh.body.error.message).toBe('资源不存在。')
    expect(zh.body.error.descriptor.messageKey).toBe('error.api.notFound')

    const en = await run(new DomainError('NOT_FOUND'), { locale: 'en-US' })
    expect(en.body.error.message).toBe('Resource not found.')
    expect(en.body.error.descriptor.fallbackMessage).toBe('Resource not found.')
  })

  it('localizes descriptor issues with their params, keeping path and fallback', async () => {
    const res = await run(
      new DomainError('BAD_REQUEST', ErrorMessages.INVALID_INPUT, [
        {
          messageKey: 'admin.settings.rateLimit.error.windowMin',
          params: { min: 60 },
          fallbackMessage: 'The time window must be at least 60 seconds',
          code: 'too_small',
          path: ['signIn', 'windowSeconds'],
        },
      ]),
      { locale: 'zh-CN' },
    )

    expect(res.body.error.issues?.[0]).toEqual({
      messageKey: 'admin.settings.rateLimit.error.windowMin',
      params: { min: 60 },
      fallbackMessage: 'The time window must be at least 60 seconds',
      message: '时间窗口不能小于 60 秒',
      code: 'too_small',
      path: ['signIn', 'windowSeconds'],
    })
    expect(res.body.error.message).toBe('输入数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒')
  })

  it('uses the custom legacy DomainError message unchanged', async () => {
    const res = await run(new DomainError('FORBIDDEN', 'cannot do that'))
    expect(res.body.error.message).toBe('cannot do that')
    expect(res.body.error.descriptor.messageKey).toBe('error.api.rawMessage')
  })

  it('returns 400 + Zod issues for a ZodError (standard prose stays English)', async () => {
    const schema = z.object({ name: z.string() })
    let zodErr!: z.ZodError
    try {
      schema.parse({})
    } catch (e) {
      zodErr = e as z.ZodError
    }
    const res = await run(zodErr)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.message).toBe('输入数据无效：name：Invalid input: expected string, received undefined')
    expect(res.body.error.descriptor.messageKey).toBe('error.api.invalidInput')
    expect(res.body.error.issues?.[0]).toMatchObject({
      messageKey: 'error.api.rawMessage',
      fallbackMessage: 'Invalid input: expected string, received undefined',
      message: 'Invalid input: expected string, received undefined',
      code: 'invalid_type',
      path: ['name'],
    })
  })

  it('localizes Zod issue messages in all four request locales', async () => {
    const expected: Record<AppLocale, string> = {
      'en-US': 'The time window must be at least 60 seconds',
      'zh-CN': '时间窗口不能小于 60 秒',
      'zh-TW': '時間視窗不能小於 60 秒',
      'zh-HK': '時間視窗不能小於 60 秒',
    }
    for (const [locale, message] of Object.entries(expected)) {
      const res = await run(zodErrorOf(), { locale: locale as AppLocale })
      const issue = res.body.error.issues?.[0]
      expect(issue?.message).toBe(message)
      expect(issue?.messageKey).toBe('admin.settings.rateLimit.error.windowMin')
      expect(issue?.fallbackMessage).toBe(expected['en-US'])
    }
  })

  it('falls back to 500 INTERNAL_SERVER_ERROR for unknown errors', async () => {
    const res = await run(new Error('boom'))
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR')
    expect(res.body.error.message).toBe('服务器内部错误')

    const en = await run(new Error('boom'), { locale: 'en-US' })
    expect(en.body.error.message).toBe('Internal server error')
  })
})

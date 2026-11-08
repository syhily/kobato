import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { AppLocale } from '@/shared/i18n/locales'
import type { Role } from '@/shared/utils/roles'

import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { onErrorHandler } from '@/server/http/errors'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'

// The perimeter RBAC middleware answers through the same localized JSON shape
// as the oRPC guard: status + code + descriptor + the request locale's copy.

function makeApp(options: { role: Role | null; locale?: AppLocale }): Hono {
  const user: SessionUser | null =
    options.role === null ? null : { id: '1', name: 'User', email: 'u@example.com', website: null, role: options.role }
  const session = makeSession(user === null ? {} : { user })
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set(
      'requestContext' as never,
      makeRequestContext({
        session,
        user,
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
  app.onError((err, c) => onErrorHandler(err, c as never))
  app.get('/protected', requireRoleMw('admin'), (c) => c.json({ ok: true }))
  return app
}

interface ErrorBody {
  error: { code: string; message: string; descriptor: { messageKey: string; fallbackMessage: string } }
}

describe('server/http/middlewares/hono-rbac — localized perimeter errors', () => {
  it('answers 401 with the request locale copy and the descriptor', async () => {
    const zh = await makeApp({ role: null }).request('/protected')
    expect(zh.status).toBe(401)
    const zhBody = (await zh.json()) as ErrorBody
    expect(zhBody.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: '需要登录后再操作。',
      descriptor: { messageKey: 'error.api.unauthorized', fallbackMessage: 'Sign in to continue.' },
    })

    const en = await makeApp({ role: null, locale: 'en-US' }).request('/protected')
    expect(en.status).toBe(401)
    expect(((await en.json()) as ErrorBody).error.message).toBe('Sign in to continue.')
  })

  it('answers 403 with the request locale copy and the descriptor', async () => {
    const zhTW = await makeApp({ role: 'author', locale: 'zh-TW' }).request('/protected')
    expect(zhTW.status).toBe(403)
    expect(((await zhTW.json()) as ErrorBody).error).toMatchObject({
      code: 'FORBIDDEN',
      message: '權限不足',
      descriptor: { messageKey: 'error.api.insufficientPermissions' },
    })

    const en = await makeApp({ role: 'author', locale: 'en-US' }).request('/protected')
    expect(((await en.json()) as ErrorBody).error.message).toBe('Insufficient permissions')
  })

  it('passes an authorized viewer through untouched', async () => {
    const res = await makeApp({ role: 'admin' }).request('/protected')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('keeps a plain raw HTTPException message unchanged (legacy fallback)', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set(
        'requestContext' as never,
        makeRequestContext({
          localization: { locale: 'en-US', timeZone: 'UTC', timeFormat: null, revision: 'boot-test:0000000000' },
        }) as never,
      )
      c.set('requestId' as never, 'req-legacy' as never)
      await next()
    })
    app.onError((err, c) => onErrorHandler(err, c as never))
    app.get('/legacy', () => {
      throw new HTTPException(418, { message: 'legacy raw copy' })
    })

    const res = await app.request('/legacy')
    expect(res.status).toBe(418)
    expect(((await res.json()) as ErrorBody).error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'legacy raw copy',
      descriptor: { messageKey: 'error.api.rawMessage', fallbackMessage: 'legacy raw copy' },
    })
  })
})

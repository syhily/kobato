import { onErrorHandler } from '@kobato/server/http/errors'
import { ActionFailure, DomainError } from '@kobato/server/infra/http/errors'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

async function run(
  err: Error,
): Promise<{ status: number; body: unknown; requestIdHeader: string | null; header: (name: string) => string | null }> {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('requestId' as never, 'req-1' as never)
    await next()
  })
  app.get('/', () => {
    throw err
  })
  app.onError((e, c) => onErrorHandler(e, c as never))
  const res = await app.request('/')
  return {
    status: res.status,
    body: await res.json(),
    requestIdHeader: res.headers.get('X-Request-Id'),
    header: (name) => res.headers.get(name),
  }
}

describe('server/http/errors — onErrorHandler', () => {
  it('returns the HTTPException status and message', async () => {
    const res = await run(new HTTPException(401, { message: 'nope' }))
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { message: 'nope' } })
    expect(res.requestIdHeader).toBe('req-1')
  })

  it('passes HTTPException cause as issues', async () => {
    const res = await run(new HTTPException(400, { message: 'bad', cause: [{ message: 'invalid' }] }))
    expect(res.body).toMatchObject({ error: { issues: [{ message: 'invalid' }] } })
  })

  it('returns ActionFailure status, message and issues', async () => {
    const res = await run(new ActionFailure(409, 'conflict', [{ message: 'dup' }]))
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: { message: 'conflict', issues: [{ message: 'dup' }] } })
  })

  it('appends ActionFailure headers onto the response', async () => {
    const res = await run(new ActionFailure(429, 'slow down', undefined, { 'X-RateLimit': '100' }))
    expect(res.status).toBe(429)
    expect(res.header('X-RateLimit')).toBe('100')
  })

  it('returns the domain status for DomainError', async () => {
    const res = await run(new DomainError('NOT_FOUND'))
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: { message: '资源不存在。' } })
  })

  it('uses the custom DomainError message when provided', async () => {
    const res = await run(new DomainError('FORBIDDEN', 'cannot do that'))
    expect(res.body).toMatchObject({ error: { message: 'cannot do that' } })
  })

  it('returns 400 + issue map for ZodError', async () => {
    const schema = z.object({ name: z.string() })
    let zodErr!: z.ZodError
    try {
      schema.parse({})
    } catch (e) {
      zodErr = e as z.ZodError
    }
    const res = await run(zodErr)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: {
        message: '输入数据无效',
      },
    })
    const issues = (res.body as { error: { issues: unknown[] } }).error.issues
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('falls back to 500 INTERNAL_SERVER_ERROR for unknown errors', async () => {
    const res = await run(new Error('boom'))
    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ error: { message: '服务器内部错误' } })
  })
})

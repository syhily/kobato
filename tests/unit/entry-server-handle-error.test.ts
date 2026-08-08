import { UNSAFE_ErrorResponseImpl } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { handleError } from '@/entry.server'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

// React Router only invokes `handleError` for non-Response errors (and
// RouteErrorResponses carrying an `error`) — thrown 4xx/5xx Responses never
// reach this hook.
describe('entry.server.tsx / handleError', () => {
  beforeEach(() => {
    __clearLogCaptureForTests()
  })

  it('logs non-aborted request errors through the structured logger', () => {
    handleError(new Error('boom'), { request: new Request('http://localhost/posts/hello') })

    const entries = __logCaptureForTests().filter((e) => e.scope === 'entry.server')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      level: 'error',
      msg: 'Router request error',
      ctx: { error: 'boom', url: 'http://localhost/posts/hello' },
    })
  })

  it('stringifies non-Error thrown values', () => {
    handleError('plain failure', { request: new Request('http://localhost/') })

    const entries = __logCaptureForTests().filter((e) => e.scope === 'entry.server')
    expect(entries).toHaveLength(1)
    expect(entries[0].ctx).toMatchObject({ error: 'plain failure' })
  })

  it('unwraps RouteErrorResponses carrying the original error', () => {
    // react-router 8.3.0 exports the class only as `UNSAFE_ErrorResponseImpl` (`ErrorResponse` is type-only).
    const routeError = new UNSAFE_ErrorResponseImpl(500, 'Internal Server Error', new Error('boom'))

    handleError(routeError, { request: new Request('http://localhost/') })

    const entries = __logCaptureForTests().filter((e) => e.scope === 'entry.server')
    expect(entries).toHaveLength(1)
    expect(entries[0].ctx).toMatchObject({ error: 'boom' })
    expect(entries[0].ctx.error).not.toBe('[object Object]')
  })

  it('skips client-aborted requests', () => {
    const request = new Request('http://localhost/')
    const controller = new AbortController()
    // A Request's signal is lazy — pass a signal we control and abort it.
    const aborted = new Request(request, { signal: controller.signal })
    controller.abort()

    handleError(new Error('late failure'), { request: aborted })

    expect(__logCaptureForTests().filter((e) => e.scope === 'entry.server')).toHaveLength(0)
  })
})

import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { UNSAFE_ErrorResponseImpl } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { handleError } from '@/entry.server'

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
    const aborted = new Request(request, { signal: controller.signal })
    controller.abort()

    handleError(new Error('late failure'), { request: aborted })

    expect(__logCaptureForTests().filter((e) => e.scope === 'entry.server')).toHaveLength(0)
  })
})

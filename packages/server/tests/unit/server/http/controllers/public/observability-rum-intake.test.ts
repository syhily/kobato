import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { SafeFetchOptions, SafeFetchResult } from '@kobato/server/infra/safe-fetch'
import type { FrontendRumRelay } from '@kobato/server/infra/trace/config'

import { publicObservabilityRouter } from '@kobato/server/http/controllers/public/observability.controller'
import { __resetRateLimitsForTests as resetRumLimits } from '@kobato/server/infra/rate-limit'
import { __resetFrontendGateForTests, activateFrontendGate } from '@kobato/server/infra/trace/frontend-gate'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { RPCHandler } from '@orpc/server/fetch'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const upstream = {
  calls: [] as Array<{ url: string; options: SafeFetchOptions }>,
  result: {
    ok: true,
    url: '',
    response: new Response(null, { status: 200 }),
    body: new ArrayBuffer(0),
  } as SafeFetchResult,
}

const safeFetch = vi
  .spyOn(await import('@kobato/server/infra/safe-fetch'), 'safeFetch')
  .mockImplementation(async (url: string, options?: SafeFetchOptions) => {
    upstream.calls.push({ url, options: options! })
    return upstream.result
  })
const recordRumRelayOutcome = vi.spyOn(await import('@kobato/server/infra/trace/metrics'), 'recordRumRelayOutcome')

const handler = new RPCHandler(publicObservabilityRouter)

const RELAY: FrontendRumRelay = {
  endpoint: 'http://10.0.0.5:5080',
  organization: 'default',
  clientToken: 'real-rum-token',
  clientIdentity: 'anonymous',
}

const FORWARD_RELAY: FrontendRumRelay = { ...RELAY, clientIdentity: 'forward' }

function context(clientAddress = '203.0.113.7', headers: Record<string, string> = {}): HandlerContext {
  return makePublicCtx({ clientAddress, headers })
}

async function callRumIntake(
  input: {
    track: string
    query: string
    body: string
    contentType: string | null
  },
  ctx: HandlerContext = context(),
) {
  const result = await handler.handle(
    new Request('http://localhost/rpc/rumIntake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: ctx },
  )
  if (!result.matched) {
    throw new Error('no route matched for the rumIntake procedure')
  }
  return result.response
}

function batchInput(
  overrides: Partial<{ track: string; query: string; body: string; contentType: string | null }> = {},
) {
  return {
    track: '/rum/v1/default/rum',
    query: 'o2-api-key=forged',
    body: '{"type":"view"}',
    contentType: null,
    ...overrides,
  }
}

beforeEach(() => {
  __resetFrontendGateForTests()
  activateFrontendGate(
    {},
    {
      applicationId: 'test',
      service: 'kobato',
      environment: 'production',
      sessionSampleRate: 100,
      clientIdentity: 'anonymous',
    },
    RELAY,
  )
  upstream.calls = []
  upstream.result = { ok: true, url: '', response: new Response(null, { status: 200 }), body: new ArrayBuffer(0) }
  recordRumRelayOutcome.mockClear()
  resetRumLimits()
})

afterAll(() => {
  __resetFrontendGateForTests()
  safeFetch.mockRestore()
  recordRumRelayOutcome.mockRestore()
})

describe('public.observability.rumIntake', () => {
  it('answers the disabled error and never forwards while the verification gate is closed', async () => {
    __resetFrontendGateForTests()

    const res = await callRumIntake(batchInput())
    expect(res.status).toBe(200)
    expect(await parseRpcJson(res)).toEqual({ kind: 'error', status: 404, message: 'RUM intake is disabled' })
    expect(upstream.calls).toHaveLength(0)
  })

  it.each([
    '/rum/replay/sessions/abc',
    '/rum/v1/default/logs',
    '/rum/v2/default/rum',
    '/rum/v1/bad.org/rum',
    '/rum/v1//rum',
    '/',
    '',
  ])('fails closed on the track %s', async (track) => {
    const res = await callRumIntake(batchInput({ track }))
    expect(await parseRpcJson(res)).toEqual({ kind: 'error', status: 404, message: 'Unknown RUM intake track' })
    expect(upstream.calls).toHaveLength(0)
  })

  it('discards the inbound organization segment and forwards to the configured one', async () => {
    const res = await callRumIntake(batchInput({ track: '/rum/v1/other-org/rum' }))
    expect(res.status).toBe(200)
    expect(await parseRpcJson(res)).toEqual({ kind: 'accepted' })
    expect(upstream.calls).toHaveLength(1)
    expect(new URL(upstream.calls[0]!.url).pathname).toBe('/rum/v1/default/rum')
  })

  it('rejects an overlong query with the captured 414 envelope', async () => {
    const res = await callRumIntake(batchInput({ query: `x=${'a'.repeat(5000)}` }))
    expect(await parseRpcJson(res)).toEqual({ kind: 'error', status: 414, message: 'Query too long' })
    expect(upstream.calls).toHaveLength(0)
  })

  it('cuts an oversized body at the byte cap with the captured 413 envelope', async () => {
    const res = await callRumIntake(batchInput({ body: 'A'.repeat(1024 * 1024 + 1) }))
    expect(await parseRpcJson(res)).toEqual({ kind: 'error', status: 413, message: 'Batch too large' })
    expect(upstream.calls).toHaveLength(0)
    expect(recordRumRelayOutcome).toHaveBeenCalledWith('oversized')
  })

  it('answers 429 with the Retry-After hint when the real per-IP relay bucket is exhausted', async () => {
    for (let i = 0; i < 240; i++) {
      expect(await parseRpcJson(await callRumIntake(batchInput()))).toEqual({ kind: 'accepted' })
    }

    const res = await callRumIntake(batchInput())
    expect(await parseRpcJson(res)).toEqual({
      kind: 'error',
      status: 429,
      message: 'Too many requests',
      retryAfterSeconds: 60,
    })
    expect(upstream.calls).toHaveLength(240)
    expect(recordRumRelayOutcome).toHaveBeenCalledWith('rate_limited')
  }, 30_000)

  it('forwards the batch with the real token injected and every inbound o2-api-key dropped', async () => {
    const res = await callRumIntake(
      batchInput({
        query: 'o2source=browser&o2-api-key=kobato-relay&o2-api-key=forged&batch_time=123',
        body: '{"type":"view"}\n{"type":"resource"}',
        contentType: 'text/plain;charset=UTF-8',
      }),
    )
    expect(res.status).toBe(200)
    expect(await parseRpcJson(res)).toEqual({ kind: 'accepted' })
    expect(recordRumRelayOutcome).toHaveBeenCalledWith('ok')

    expect(upstream.calls).toHaveLength(1)
    const call = upstream.calls[0]!
    const url = new URL(call.url)
    expect(url.origin).toBe('http://10.0.0.5:5080')
    expect(url.pathname).toBe('/rum/v1/default/rum')
    expect(url.searchParams.getAll('o2-api-key')).toEqual(['real-rum-token'])
    expect(url.searchParams.get('o2source')).toBe('browser')
    expect(url.searchParams.get('batch_time')).toBe('123')
    expect(call.url).not.toContain('kobato-relay')
    expect(call.url).not.toContain('forged')

    expect(call.options.method).toBe('POST')
    expect(call.options.body).toBe('{"type":"view"}\n{"type":"resource"}')
    expect(call.options.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' })
    expect(call.options.trustedOrigin).toBe('http://10.0.0.5:5080')
    expect(call.options.maxRedirects).toBe(0)
    expect(call.options.operation).toBe('observability.rum.relay')
  })

  it('normalizes a json content type and falls back to text/plain without one', async () => {
    await callRumIntake(batchInput({ contentType: 'application/json; charset=utf-8' }))
    await callRumIntake(batchInput({ contentType: 'text/plain;charset=UTF-8' }))
    await callRumIntake(batchInput({ contentType: null }))
    expect(upstream.calls[0]!.options.headers).toEqual({ 'content-type': 'application/json' })
    expect(upstream.calls[1]!.options.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' })
    expect(upstream.calls[2]!.options.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' })
  })

  it('attaches the client address and the original User-Agent only in forward mode', async () => {
    activateFrontendGate(
      {},
      {
        applicationId: 'test',
        service: 'kobato',
        environment: 'production',
        sessionSampleRate: 100,
        clientIdentity: 'forward',
      },
      FORWARD_RELAY,
    )

    const res = await callRumIntake(
      batchInput(),
      context('203.0.113.7', { 'user-agent': 'Mozilla/5.0 (Kobato Test Browser)' }),
    )
    expect(res.status).toBe(200)
    expect(upstream.calls).toHaveLength(1)
    expect(upstream.calls[0]!.options.headers).toEqual({
      'content-type': 'text/plain;charset=UTF-8',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'Mozilla/5.0 (Kobato Test Browser)',
    })
  })

  it('omits the User-Agent in forward mode when the browser sent none', async () => {
    activateFrontendGate(
      {},
      {
        applicationId: 'test',
        service: 'kobato',
        environment: 'production',
        sessionSampleRate: 100,
        clientIdentity: 'forward',
      },
      FORWARD_RELAY,
    )

    const res = await callRumIntake(batchInput(), context('203.0.113.7'))
    expect(res.status).toBe(200)
    const headers = upstream.calls[0]!.options.headers as Record<string, string>
    expect(headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(headers).not.toHaveProperty('user-agent')
  })

  it('forwards no request identity in the default anonymous mode', async () => {
    const res = await callRumIntake(
      batchInput(),
      context('203.0.113.7', { 'user-agent': 'Mozilla/5.0 (Kobato Test Browser)' }),
    )
    expect(res.status).toBe(200)
    const headers = upstream.calls[0]!.options.headers as Record<string, string>
    expect(headers).not.toHaveProperty('x-forwarded-for')
    expect(headers).not.toHaveProperty('user-agent')
  })

  it('never reflects the upstream detail or the token to the caller on failure', async () => {
    upstream.result = { ok: false, reason: 'http-error', url: 'http://10.0.0.5:5080/rum', status: 500, error: null }

    const res = await callRumIntake(batchInput())
    const answer = await parseRpcJson(res)
    expect(answer).toEqual({
      kind: 'error',
      status: 502,
      message: 'RUM relay failed',
      retryAfterSeconds: 5,
    })
    expect(JSON.stringify(answer)).not.toContain('10.0.0.5')
    expect(JSON.stringify(answer)).not.toContain('real-rum-token')
    expect(JSON.stringify(answer)).not.toContain('500"')
    expect(recordRumRelayOutcome).toHaveBeenCalledWith('upstream_error')
  })
})

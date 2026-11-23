import { publicObservabilityRouter } from '@kobato/server/http/controllers/public/observability.controller'
import { __resetFrontendGateForTests, activateFrontendGate } from '@kobato/server/infra/trace/frontend-gate'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const RELAY = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  clientToken: 'rum-client-token',
  clientIdentity: 'anonymous',
} as const

beforeEach(() => {
  __resetFrontendGateForTests()
})

afterEach(() => {
  __resetFrontendGateForTests()
})

function activate(): void {
  activateFrontendGate(
    {},
    {
      applicationId: 'test',
      service: 'kobato',
      environment: 'production',
      sessionSampleRate: 100,
      clientIdentity: 'anonymous',
    } as never,
    RELAY,
  )
}

describe('publicObservabilityRouter.rumStatus', () => {
  it('returns a boolean, no-store status payload', async () => {
    const context = makePublicCtx()
    expect(await call(publicObservabilityRouter.rumStatus, {}, { context })).toEqual({ enabled: false })
    expect(context.responseHeaders.get('Cache-Control')).toBe('no-store')

    activate()
    expect(await call(publicObservabilityRouter.rumStatus, {}, { context })).toEqual({ enabled: true })
  })

  it('never exposes the client token or endpoint detail', async () => {
    activate()
    const result = await call(publicObservabilityRouter.rumStatus, {}, { context: makePublicCtx() })
    const body = JSON.stringify(result)

    expect(body).not.toContain('127.0.0.1')
    expect(body).not.toContain('rum-client-token')
    expect(body).not.toContain('clientToken')
  })
})

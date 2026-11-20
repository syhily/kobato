import { rumStatusRouter } from '@kobato/server/http/resources/rum-status.ts'
import { __resetFrontendGateForTests, activateFrontendGate } from '@kobato/server/infra/trace/frontend-gate.ts'
import { Hono } from 'hono'
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

describe('rumStatusRouter', () => {
  it('returns a boolean, no-store status payload', async () => {
    const app = new Hono().route('/', rumStatusRouter)

    const disabled = await app.request('/api/rum/status')
    expect(disabled.status).toBe(200)
    expect(disabled.headers.get('Cache-Control')).toBe('no-store')
    expect(await disabled.json()).toEqual({ enabled: false })

    activate()
    const enabled = await app.request('/api/rum/status')
    expect(await enabled.json()).toEqual({ enabled: true })
  })

  it('never exposes the client token or endpoint detail', async () => {
    activate()
    const app = new Hono().route('/', rumStatusRouter)
    const body = await (await app.request('/api/rum/status')).text()

    expect(body).not.toContain('127.0.0.1')
    expect(body).not.toContain('rum-client-token')
    expect(body).not.toContain('clientToken')
  })
})

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gate = vi.hoisted(() => ({ active: false }))

vi.mock('@/server/infra/trace/config', () => ({
  activeFrontendRum: () => (gate.active ? { site: 'http://127.0.0.1:5080' } : null),
}))

import { devRumStatusRouter } from '@/server/http/resources/dev-rum'

beforeEach(() => {
  gate.active = false
})

describe('devRumStatusRouter', () => {
  it('returns a boolean, no-store status payload', async () => {
    const app = new Hono().route('/', devRumStatusRouter)

    const disabled = await app.request('/api/dev/rum/status')
    expect(disabled.status).toBe(200)
    expect(disabled.headers.get('Cache-Control')).toBe('no-store')
    expect(await disabled.json()).toEqual({ enabled: false })

    gate.active = true
    const enabled = await app.request('/api/dev/rum/status')
    expect(await enabled.json()).toEqual({ enabled: true })
  })

  it('never exposes the client token or endpoint detail', async () => {
    gate.active = true
    const app = new Hono().route('/', devRumStatusRouter)
    const body = await (await app.request('/api/dev/rum/status')).text()

    expect(body).not.toContain('127.0.0.1')
    expect(body).not.toContain('rum-client-token')
    expect(body).not.toContain('clientToken')
  })
})

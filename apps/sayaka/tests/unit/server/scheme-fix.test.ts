// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import { schemeFix } from '@sayaka/server/scheme-fix'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

function socketEnv(remoteAddress: string | undefined) {
  return { incoming: { socket: { remoteAddress } } }
}

function makeApp() {
  const app = new Hono<Env>()
  app.use(schemeFix)
  app.all('/echo', (c) => c.text(c.req.raw.url))
  return app
}

describe('schemeFix', () => {
  it('applies x-forwarded-proto from a loopback peer', async () => {
    const app = makeApp()
    const response = await app.request('/echo', { headers: { 'x-forwarded-proto': 'https' } }, socketEnv('127.0.0.1'))
    expect(await response.text()).toBe('https://localhost/echo')
  })

  it('applies Forwarded: proto= from a loopback peer', async () => {
    const app = makeApp()
    const response = await app.request('/echo', { headers: { forwarded: 'for=1.2.3.4;proto=https' } }, socketEnv('::1'))
    expect(await response.text()).toBe('https://localhost/echo')
  })

  it('ignores proxy proto headers from an untrusted peer', async () => {
    const app = makeApp()
    const response = await app.request(
      '/echo',
      { headers: { 'x-forwarded-proto': 'https', forwarded: 'proto=https' } },
      socketEnv('203.0.113.9'),
    )
    expect(await response.text()).toBe('http://localhost/echo')
  })

  it('ignores garbage protocol values', async () => {
    const app = makeApp()
    const response = await app.request('/echo', { headers: { 'x-forwarded-proto': 'gopher' } }, socketEnv('127.0.0.1'))
    expect(await response.text()).toBe('http://localhost/echo')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ZeaburConfig } from '@/server/infra/email/transports/zeabur-zsend'

import { ZeaburZSendTransport } from '@/server/infra/email/transports/zeabur-zsend'

// These tests pin the Zeabur ZSend transport behavior that used to live
// inline in `sender.ts:sendEmail`. The dispatcher routes everything to
// this transport today, so the contract here is what every mail sender
// (password reset, OTP, comment notifications, author invite) actually
// relies on.

const baseConfig: ZeaburConfig = {
  enabled: true,
  host: 'api.zeabur.com',
  apiKey: 'SECRET',
  sender: 'noreply@example.com',
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ZeaburZSendTransport', () => {
  describe('skip branches', () => {
    it('returns reason=disabled without touching the network when enabled=false', async () => {
      const transport = new ZeaburZSendTransport({ ...baseConfig, enabled: false })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('disabled')
        expect(result.message).toContain('关闭')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when host is missing', async () => {
      const transport = new ZeaburZSendTransport({ ...baseConfig, host: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
        expect(result.message).toContain('Host')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when apiKey is missing', async () => {
      const transport = new ZeaburZSendTransport({ ...baseConfig, apiKey: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when sender is missing', async () => {
      const transport = new ZeaburZSendTransport({ ...baseConfig, sender: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('POSTs to the zsend endpoint with the bearer token and returns ok=true', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
      const transport = new ZeaburZSendTransport(baseConfig)

      const result = await transport.send(
        { to: 'to@example.com', subject: 'hi', html: '<p>body</p>' },
        { bcc: ['audit@example.com'] },
      )

      expect(result.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.zeabur.com/api/v1/zsend/emails')
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers.Authorization).toBe('Bearer SECRET')
      expect(headers['Content-Type']).toBe('application/json')
      const body = JSON.parse(init?.body as string)
      expect(body.from).toBe('noreply@example.com')
      expect(body.to).toEqual(['to@example.com'])
      expect(body.bcc).toEqual(['audit@example.com'])
      expect(body.subject).toBe('hi')
      expect(body.html).toBe('<p>body</p>')
    })

    it('omits bcc from the body when the option is absent', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
      const transport = new ZeaburZSendTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(init?.body as string)
      expect(body.bcc).toBeUndefined()
    })

    it('omits bcc from the body when the option is an empty array', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
      const transport = new ZeaburZSendTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' }, { bcc: [] })

      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(init?.body as string)
      expect(body.bcc).toBeUndefined()
    })
  })

  describe('failure branches', () => {
    it('surfaces a non-2xx upstream response as reason=upstream with the status', async () => {
      fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }))
      const transport = new ZeaburZSendTransport(baseConfig)

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false && result.reason === 'upstream') {
        expect(result.status).toBe(429)
        expect(result.message).toContain('429')
        expect(result.message).not.toContain('quota exceeded')
      } else {
        throw new Error(`expected reason=upstream, got ${JSON.stringify(result)}`)
      }
    })

    it('surfaces a fetch throw as reason=network with the error message', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const transport = new ZeaburZSendTransport(baseConfig)

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false && result.reason === 'network') {
        expect(result.message).toContain('ECONNREFUSED')
      } else {
        throw new Error(`expected reason=network, got ${JSON.stringify(result)}`)
      }
    })
  })

  it('exposes name=zeabur-zsend', () => {
    const transport = new ZeaburZSendTransport(baseConfig)
    expect(transport.name).toBe('zeabur-zsend')
  })
})

import type { MockInstance } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailgunConfig } from '@/server/infra/email/transports/mailgun'

// Mock the mailgun.js SDK before importing the transport — the transport
// instantiates a client at construction time, so the mock has to be in
// place before `new MailgunTransport(...)`.
const createMock = vi.fn()
const clientMock = { messages: { create: createMock } }
vi.mock('mailgun.js', () => {
  return {
    default: class FakeMailgun {
      // The transport passes the global FormData constructor through.
      // We accept and ignore it here — the SDK only uses it to wrap the
      // outgoing multipart body, which the mock short-circuits anyway.
      constructor() {}
      client() {
        return clientMock
      }
    },
  }
})

const { MailgunTransport } = await import('@/server/infra/email/transports/mailgun')

const baseConfig: MailgunConfig = {
  enabled: true,
  domain: 'mg.example.com',
  apiKey: 'SECRET',
  sender: 'noreply@mg.example.com',
}

describe('MailgunTransport', () => {
  let errorSpy: MockInstance
  beforeEach(() => {
    createMock.mockReset()
    // The dispatcher logs every failure; silence those in test output.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  describe('skip branches', () => {
    it('returns reason=disabled without touching the SDK when enabled=false', async () => {
      const transport = new MailgunTransport({ ...baseConfig, enabled: false })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('disabled')
        expect(result.message).toContain('关闭')
      }
      expect(createMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when domain is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, domain: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
        expect(result.message).toContain('Domain')
      }
      expect(createMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when apiKey is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, apiKey: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(createMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when sender is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, sender: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(createMock).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('calls messages.create on the configured domain and returns ok=true', async () => {
      createMock.mockResolvedValueOnce({ id: '<id@mg.example.com>', message: 'Queued. Thank you.', status: 200 })
      const transport = new MailgunTransport(baseConfig)

      const result = await transport.send(
        { to: 'to@example.com', subject: 'hi', html: '<p>body</p>' },
        { bcc: ['audit@example.com'] },
      )

      expect(result.ok).toBe(true)
      expect(createMock).toHaveBeenCalledOnce()
      const [domain, payload] = createMock.mock.calls[0]
      expect(domain).toBe('mg.example.com')
      expect(payload.from).toBe('noreply@mg.example.com')
      expect(payload.to).toEqual(['to@example.com'])
      expect(payload.bcc).toEqual(['audit@example.com'])
      expect(payload.subject).toBe('hi')
      expect(payload.html).toBe('<p>body</p>')
    })

    it('omits bcc from the payload when the option is absent', async () => {
      createMock.mockResolvedValueOnce({ status: 200 })
      const transport = new MailgunTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      const [, payload] = createMock.mock.calls[0]
      expect(payload.bcc).toBeUndefined()
    })

    it('omits bcc from the payload when the option is an empty array', async () => {
      createMock.mockResolvedValueOnce({ status: 200 })
      const transport = new MailgunTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' }, { bcc: [] })

      const [, payload] = createMock.mock.calls[0]
      expect(payload.bcc).toBeUndefined()
    })
  })

  describe('failure branches', () => {
    it('surfaces an SDK APIError (with .status) as reason=upstream with the status', async () => {
      // mailgun.js throws APIError carrying { status, message, details } on
      // any non-2xx upstream response. We reconstruct the shape here.
      const apiError = Object.assign(new Error('Bad Request'), { status: 400, details: 'invalid from' })
      createMock.mockRejectedValueOnce(apiError)
      const transport = new MailgunTransport(baseConfig)

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false && result.reason === 'upstream') {
        expect(result.status).toBe(400)
        expect(result.message).toContain('400')
        // The upstream body never leaks into the user-facing message.
        expect(result.message).not.toContain('invalid from')
      } else {
        throw new Error(`expected reason=upstream, got ${JSON.stringify(result)}`)
      }
    })

    it('surfaces a plain SDK throw (no .status) as reason=network', async () => {
      createMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const transport = new MailgunTransport(baseConfig)

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false && result.reason === 'network') {
        expect(result.message).toContain('ECONNREFUSED')
      } else {
        throw new Error(`expected reason=network, got ${JSON.stringify(result)}`)
      }
    })
  })

  it('exposes name=mailgun', () => {
    const transport = new MailgunTransport(baseConfig)
    expect(transport.name).toBe('mailgun')
  })
})

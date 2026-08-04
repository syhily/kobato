import type { MailgunConfig } from '@kobato/server/infra/email/transports/mailgun'
import type { MockInstance } from 'vitest'

import { MailgunTransport } from '@kobato/server/infra/email/transports/mailgun'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const baseConfig: MailgunConfig = {
  enabled: true,
  domain: 'mg.example.com',
  apiKey: 'SECRET',
  sender: 'noreply@mg.example.com',
}

// The transport talks to the Mailgun v3 API with native fetch — stub the
// global instead of the old SDK client.
const fetchMock = vi.fn()

function formDataEntries(body: unknown): Record<string, string[]> {
  expect(body).toBeInstanceOf(FormData)
  const entries: Record<string, string[]> = {}
  for (const [key, value] of (body as FormData).entries()) {
    entries[key] = [...(entries[key] ?? []), String(value)]
  }
  return entries
}

describe('MailgunTransport', () => {
  let errorSpy: MockInstance
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // The dispatcher logs every failure; silence those in test output.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    errorSpy.mockRestore()
  })

  describe('skip branches', () => {
    it('returns reason=disabled without calling the API when enabled=false', async () => {
      const transport = new MailgunTransport({ ...baseConfig, enabled: false })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('disabled')
        expect(result.message).toContain('关闭')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when domain is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, domain: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
        expect(result.message).toContain('Domain')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when apiKey is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, apiKey: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when sender is missing', async () => {
      const transport = new MailgunTransport({ ...baseConfig, sender: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('POSTs multipart form data to the configured domain and returns ok=true', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"id":"<id@mg.example.com>"}', { status: 200 }))
      const transport = new MailgunTransport(baseConfig)

      const result = await transport.send(
        { to: 'to@example.com', subject: 'hi', html: '<p>body</p>' },
        { bcc: ['audit@example.com'] },
      )

      expect(result.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.mailgun.net/v3/mg.example.com/messages')
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('api:SECRET').toString('base64')}`)

      const payload = formDataEntries(init.body)
      expect(payload.from).toEqual(['noreply@mg.example.com'])
      expect(payload.to).toEqual(['to@example.com'])
      expect(payload.bcc).toEqual(['audit@example.com'])
      expect(payload.subject).toEqual(['hi'])
      expect(payload.html).toEqual(['<p>body</p>'])
    })

    it('omits bcc from the payload when the option is absent', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const transport = new MailgunTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      const [, init] = fetchMock.mock.calls[0]
      expect(formDataEntries(init.body).bcc).toBeUndefined()
    })

    it('omits bcc from the payload when the option is an empty array', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const transport = new MailgunTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' }, { bcc: [] })

      const [, init] = fetchMock.mock.calls[0]
      expect(formDataEntries(init.body).bcc).toBeUndefined()
    })
  })

  describe('failure branches', () => {
    it('surfaces a non-2xx response as reason=upstream with the status', async () => {
      fetchMock.mockResolvedValueOnce(new Response('invalid from', { status: 400, statusText: 'Bad Request' }))
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

    it('surfaces a fetch throw as reason=network', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
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

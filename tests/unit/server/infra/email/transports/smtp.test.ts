import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock nodemailer at the import boundary so the test never opens a real
// SMTP socket. `createTransport` returns a stub transporter whose
// `sendMail` we assert against.
const sendMailMock = vi.fn()
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import type { SmtpConfig } from '@/server/infra/email/transports/smtp'

import { SmtpTransport } from '@/server/infra/email/transports/smtp'

// These tests pin the SMTP transport stub. The dispatcher does not yet
// route to this transport — see `sender.ts:getTransport()` — so these
// tests are the only thing exercising the SmtpTransport code path.
// They lock in the same skip / happy / failure vocabulary the Zeabur
// transport speaks so the dispatcher can swap them transparently.

const baseConfig: SmtpConfig = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  user: 'postmaster',
  pass: 'SECRET',
  sender: 'noreply@example.com',
  secure: false,
}

beforeEach(() => {
  sendMailMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SmtpTransport', () => {
  describe('skip branches', () => {
    it('returns reason=disabled without calling sendMail when enabled=false', async () => {
      const transport = new SmtpTransport({ ...baseConfig, enabled: false })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('disabled')
        expect(result.message).toContain('关闭')
      }
      expect(sendMailMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when host is missing', async () => {
      const transport = new SmtpTransport({ ...baseConfig, host: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
        expect(result.message).toContain('SMTP')
      }
      expect(sendMailMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when user is missing', async () => {
      const transport = new SmtpTransport({ ...baseConfig, user: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(sendMailMock).not.toHaveBeenCalled()
    })

    it('returns reason=unconfigured when pass is missing', async () => {
      const transport = new SmtpTransport({ ...baseConfig, pass: '' })

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.reason).toBe('unconfigured')
      }
      expect(sendMailMock).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('calls nodemailer sendMail with from/to/bcc/subject/html and returns ok=true', async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: '<1@example.com>' })
      const transport = new SmtpTransport(baseConfig)

      const result = await transport.send(
        { to: 'to@example.com', subject: 'hi', html: '<p>body</p>' },
        { bcc: ['audit@example.com'] },
      )

      expect(result.ok).toBe(true)
      expect(sendMailMock).toHaveBeenCalledOnce()
      const payload = sendMailMock.mock.calls[0][0]
      expect(payload.from).toBe('noreply@example.com')
      expect(payload.to).toBe('to@example.com')
      expect(payload.bcc).toEqual(['audit@example.com'])
      expect(payload.subject).toBe('hi')
      expect(payload.html).toBe('<p>body</p>')
    })

    it('omits bcc from the payload when the option is absent', async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: '<1@example.com>' })
      const transport = new SmtpTransport(baseConfig)

      await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      const payload = sendMailMock.mock.calls[0][0]
      expect(payload.bcc).toBeUndefined()
    })
  })

  describe('failure branches', () => {
    it('surfaces a nodemailer throw as reason=network with the error message', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      const transport = new SmtpTransport(baseConfig)

      const result = await transport.send({ to: 'to@example.com', subject: 'hi', html: '<p/>' })

      expect(result.ok).toBe(false)
      if (result.ok === false && result.reason === 'network') {
        expect(result.message).toContain('ECONNREFUSED')
      } else {
        throw new Error(`expected reason=network, got ${JSON.stringify(result)}`)
      }
    })
  })

  it('exposes name=smtp', () => {
    const transport = new SmtpTransport(baseConfig)
    expect(transport.name).toBe('smtp')
  })
})

import { describe, expect, it } from 'vitest'

import { mailSchema } from '@/server/domains/settings/sections/mail'

describe('settings/sections/mail', () => {
  it('defaults to zeabur transport and empty smtp fields', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: false,
        host: 'api.zeabur.com',
        apiKey: '',
        sender: 'noreply@example.com',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.transport).toBe('zeabur')
    expect(result.data.mail.smtpHost).toBe('')
    expect(result.data.mail.smtpPort).toBe(587)
    expect(result.data.mail.smtpUser).toBe('')
    expect(result.data.mail.smtpSecure).toBe(false)
    expect(result.data.mail.smtpRequireTls).toBe(true)
    expect(result.data.mail.smtpRejectUnauthorized).toBe(true)
  })

  it('accepts smtp transport with all fields', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: true,
        host: '',
        sender: 'noreply@example.com',
        transport: 'smtp',
        smtpHost: 'smtp.example.com',
        smtpPort: '465',
        smtpUser: 'user',
        smtpPass: 'secret',
        smtpSecure: true,
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.transport).toBe('smtp')
    expect(result.data.mail.smtpPort).toBe(465)
    expect(result.data.mail.smtpSecure).toBe(true)
  })

  it('rejects invalid transport values', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: true,
        host: 'api.zeabur.com',
        sender: 'noreply@example.com',
        transport: 'sendgrid',
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts mailgun transport with domain and api key', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: true,
        sender: 'noreply@mg.example.com',
        transport: 'mailgun',
        mailgunDomain: 'mg.example.com',
        mailgunApiKey: 'mg-key',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.transport).toBe('mailgun')
    expect(result.data.mail.mailgunDomain).toBe('mg.example.com')
    expect(result.data.mail.mailgunApiKey).toBe('mg-key')
  })

  it('rejects smtp port out of range', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'smtp',
        smtpHost: 'smtp.example.com',
        smtpPort: 70000,
        smtpUser: 'user',
        smtpPass: 'secret',
      },
    })
    expect(result.success).toBe(false)
  })

  it('allows omitting secret fields', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: true,
        host: 'api.zeabur.com',
        sender: 'noreply@example.com',
        transport: 'zeabur',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.apiKey).toBeUndefined()
    expect(result.data.mail.smtpPass).toBeUndefined()
  })

  it('allows switching transport without the other provider fields filled', () => {
    const toSmtp = mailSchema.safeParse({
      mail: {
        enabled: true,
        host: 'api.zeabur.com',
        apiKey: 'key',
        sender: 'noreply@example.com',
        transport: 'smtp',
      },
    })
    expect(toSmtp.success).toBe(true)

    const toZeabur = mailSchema.safeParse({
      mail: {
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'zeabur',
        smtpHost: 'smtp.example.com',
        smtpUser: 'user',
        smtpPass: 'secret',
      },
    })
    expect(toZeabur.success).toBe(true)
  })

  describe('host / mailgunDomain hostname shape', () => {
    function parse(overrides: Record<string, unknown>) {
      return mailSchema.safeParse({
        mail: { enabled: true, sender: 'noreply@example.com', ...overrides },
      })
    }

    it('accepts dotted hostnames and the empty string', () => {
      for (const value of ['api.zeabur.com', 'mg.example.com', 'smtp.eu.mailgun.org', 'a-b.example.co.uk', '']) {
        expect(parse({ host: value }).success, `host=${value}`).toBe(true)
      }
      for (const value of ['mg.example.com', 'sandbox123.mailgun.org', '']) {
        expect(parse({ transport: 'mailgun', mailgunDomain: value }).success, `mailgunDomain=${value}`).toBe(true)
      }
    })

    it('trims before validating', () => {
      const result = parse({ host: '  api.zeabur.com  ' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.mail.host).toBe('api.zeabur.com')
      }
    })

    it('rejects schemes, ports, paths, emails, IP literals, and bare labels', () => {
      const rejected = [
        'https://api.zeabur.com',
        'api.zeabur.com:443',
        'api.zeabur.com/path',
        'user@api.zeabur.com',
        '127.0.0.1',
        '10.0.0.1',
        '[::1]',
        'localhost',
        '-bad.example.com',
        'bad-.example.com',
        'bad label.example.com',
      ]
      for (const value of rejected) {
        expect(parse({ host: value }).success, `host=${value}`).toBe(false)
        expect(parse({ transport: 'mailgun', mailgunDomain: value }).success, `mailgunDomain=${value}`).toBe(false)
      }
    })

    it('surfaces a user-facing Chinese message', () => {
      const result = parse({ host: 'https://api.zeabur.com' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('不能带协议、端口、路径或 IP 地址')
      }
    })
  })
})

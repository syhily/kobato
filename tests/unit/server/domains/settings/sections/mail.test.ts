import { describe, expect, it } from 'vitest'

import { mailSchema } from '@/server/domains/settings/sections/mail'

describe('settings/sections/mail', () => {
  it('defaults to smtp transport and empty smtp fields', () => {
    const result = mailSchema.safeParse({
      mail: {
        enabled: false,
        sender: 'noreply@example.com',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.transport).toBe('smtp')
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

  it('coerces out-of-union transport values stored by older builds to smtp', () => {
    for (const legacy of ['zeabur', 'sendgrid']) {
      const result = mailSchema.safeParse({
        mail: {
          enabled: true,
          sender: 'noreply@example.com',
          transport: legacy,
          smtpHost: 'smtp.example.com',
        },
      })
      expect(result.success, `transport=${legacy}`).toBe(true)
      if (result.success) {
        expect(result.data.mail.transport).toBe('smtp')
        expect(result.data.mail.smtpHost).toBe('smtp.example.com')
      }
    }
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
        sender: 'noreply@example.com',
        transport: 'smtp',
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }
    expect(result.data.mail.smtpPass).toBeUndefined()
    expect(result.data.mail.mailgunApiKey).toBeUndefined()
  })

  it('allows switching transport without the other provider fields filled', () => {
    const toSmtp = mailSchema.safeParse({
      mail: {
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'smtp',
        mailgunDomain: 'mg.example.com',
        mailgunApiKey: 'key',
      },
    })
    expect(toSmtp.success).toBe(true)

    const toMailgun = mailSchema.safeParse({
      mail: {
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'mailgun',
        smtpHost: 'smtp.example.com',
        smtpUser: 'user',
        smtpPass: 'secret',
      },
    })
    expect(toMailgun.success).toBe(true)
  })

  describe('mailgunDomain hostname shape', () => {
    function parse(overrides: Record<string, unknown>) {
      return mailSchema.safeParse({
        mail: { enabled: true, sender: 'noreply@example.com', transport: 'mailgun', ...overrides },
      })
    }

    it('accepts dotted hostnames and the empty string', () => {
      for (const value of [
        'mg.example.com',
        'sandbox123.mailgun.org',
        'smtp.eu.mailgun.org',
        'a-b.example.co.uk',
        '',
      ]) {
        expect(parse({ mailgunDomain: value }).success, `mailgunDomain=${value}`).toBe(true)
      }
    })

    it('trims before validating', () => {
      const result = parse({ mailgunDomain: '  mg.example.com  ' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.mail.mailgunDomain).toBe('mg.example.com')
      }
    })

    it('rejects schemes, ports, paths, emails, IP literals, and bare labels', () => {
      const rejected = [
        'https://mg.example.com',
        'mg.example.com:443',
        'mg.example.com/path',
        'user@mg.example.com',
        '127.0.0.1',
        '10.0.0.1',
        '[::1]',
        'localhost',
        '-bad.example.com',
        'bad-.example.com',
        'bad label.example.com',
      ]
      for (const value of rejected) {
        expect(parse({ mailgunDomain: value }).success, `mailgunDomain=${value}`).toBe(false)
      }
    })

    it('surfaces a user-facing Chinese message', () => {
      const result = parse({ mailgunDomain: 'https://mg.example.com' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('不能带协议、端口、路径或 IP 地址')
      }
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transportSendMock = vi.fn<(payload: unknown, opts: unknown) => Promise<unknown>>()
const SmtpCtorMock = vi.fn()
const MailgunCtorMock = vi.fn()

vi.mock('@/server/infra/email/transports/smtp', () => ({
  SmtpTransport: class {
    constructor(config: unknown) {
      SmtpCtorMock(config)
    }
    send = transportSendMock
  },
}))

vi.mock('@/server/infra/email/transports/mailgun', () => ({
  MailgunTransport: class {
    constructor(config: unknown) {
      MailgunCtorMock(config)
    }
    send = transportSendMock
  },
}))

vi.mock('@/server/infra/email/render', () => ({
  render: (input: string) => `<html>${input}</html>`,
}))

vi.mock('@/server/infra/email/templates/AuthorInvite', (actual) => ({
  default: (props: unknown) => `invite:${JSON.stringify(props)}`,
  __esmodule: true,
  ...(actual as object),
}))
vi.mock('@/server/infra/email/templates/PasswordReset', () => ({
  default: (props: unknown) => `reset:${JSON.stringify(props)}`,
}))
vi.mock('@/server/infra/email/templates/SignInOtp', () => ({
  default: (props: unknown) => `otp:${JSON.stringify(props)}`,
}))
vi.mock('@/server/infra/email/templates/SignInLink', () => ({
  default: (props: unknown) => `link:${JSON.stringify(props)}`,
}))

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  checkMailReady,
  invalidateMailTransportCache,
  sendAuthorInvite,
  sendEmail,
  sendPasswordReset,
  sendSignInLink,
  sendSignInOtp,
  sendTestMail,
} from '@/server/infra/email/sender'

beforeEach(() => {
  transportSendMock.mockReset()
  SmtpCtorMock.mockReset()
  MailgunCtorMock.mockReset()
  transportSendMock.mockResolvedValue({ ok: true })
  vi.unstubAllGlobals()
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        enabled: true,
        notificationEmails: true,
        sender: 'noreply@example.com',
        transport: 'smtp',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
        smtpSecure: false,
        smtpRequireTls: true,
        smtpRejectUnauthorized: true,
        mailgunDomain: '',
        mailgunApiKey: '',
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  invalidateMailTransportCache()
})

describe('infra/email/sender — checkMailReady readiness matrix', () => {
  type Mail = Parameters<typeof checkMailReady>[0]

  const fullyConfigured: Mail = {
    enabled: true,
    notificationEmails: true,
    sender: 's',
    transport: 'smtp',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'u',
    smtpPass: 'p',
    smtpSecure: false,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: 'mg.example.com',
    mailgunApiKey: 'mg-key',
  }

  const cases: Array<{
    name: string
    mail: Mail
    options?: Parameters<typeof checkMailReady>[1]
    expected: { ready: true } | { ready: false; reason: 'disabled' | 'unconfigured' }
  }> = [
    {
      name: 'disabled when the master switch is off',
      mail: { ...fullyConfigured, enabled: false },
      expected: { ready: false, reason: 'disabled' },
    },
    {
      name: 'ready when disabled but test sends bypass the master switch',
      mail: { ...fullyConfigured, enabled: false },
      options: { ignoreEnabled: true },
      expected: { ready: true },
    },
    // smtp requires smtpHost / smtpUser / smtpPass / sender
    {
      name: 'smtp missing host',
      mail: { ...fullyConfigured, transport: 'smtp', smtpHost: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'smtp missing user',
      mail: { ...fullyConfigured, transport: 'smtp', smtpUser: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'smtp missing pass',
      mail: { ...fullyConfigured, transport: 'smtp', smtpPass: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'smtp missing sender',
      mail: { ...fullyConfigured, transport: 'smtp', sender: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'smtp fully configured',
      mail: { ...fullyConfigured, transport: 'smtp' },
      expected: { ready: true },
    },
    // mailgun requires mailgunDomain / mailgunApiKey / sender
    {
      name: 'mailgun missing domain',
      mail: { ...fullyConfigured, transport: 'mailgun', mailgunDomain: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'mailgun missing apiKey',
      mail: { ...fullyConfigured, transport: 'mailgun', mailgunApiKey: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'mailgun missing sender',
      mail: { ...fullyConfigured, transport: 'mailgun', sender: '' },
      expected: { ready: false, reason: 'unconfigured' },
    },
    {
      name: 'mailgun fully configured',
      mail: { ...fullyConfigured, transport: 'mailgun' },
      expected: { ready: true },
    },
  ]

  it.each(cases)('$name', ({ mail, options, expected }) => {
    const result = checkMailReady(mail, options)
    expect(result.ready).toBe(expected.ready)
    if (!result.ready && !expected.ready) {
      expect(result.reason).toBe(expected.reason)
    }
  })
})

describe('infra/email/sender — sendEmail', () => {
  it('delegates to the smtp transport by default', async () => {
    const result = await sendEmail('to@x.com', 'subj', '<p>hi</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(1)
    expect(SmtpCtorMock).toHaveBeenCalledTimes(1)
    expect(MailgunCtorMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('passes the stored TLS flags through to the smtp transport', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: 'noreply@example.com',
          transport: 'smtp',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpPass: 'pass',
          smtpSecure: false,
          smtpRequireTls: false,
          smtpRejectUnauthorized: false,
          mailgunDomain: '',
          mailgunApiKey: '',
        },
      },
    })
    const result = await sendEmail('to@x.com', 'subj', '<p>hi</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(1)
    expect(SmtpCtorMock).toHaveBeenCalledTimes(1)
    // A stored `false` for either TLS flag must reach the transport —
    // dropping them here used to force the nodemailer defaults (true).
    // The transport-level `?? true` fallback is pinned in
    // `transports/smtp.test.ts`.
    expect(SmtpCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        pass: 'pass',
        secure: false,
        requireTls: false,
        rejectUnauthorized: false,
        sender: 'noreply@example.com',
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('uses mailgun transport when transport is mailgun', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: 'noreply@mg.example.com',
          transport: 'mailgun',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: 'mg.example.com',
          mailgunApiKey: 'mg-key',
        },
      },
    })
    const result = await sendEmail('to@x.com', 'subj', '<p>hi</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(1)
    expect(MailgunCtorMock).toHaveBeenCalledTimes(1)
    expect(MailgunCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'mg.example.com',
        apiKey: 'mg-key',
        sender: 'noreply@mg.example.com',
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('passes bcc through when provided', async () => {
    await sendEmail('to@x.com', 'subj', '<p>hi</p>', { bcc: ['bcc@x.com'] })
    const args = transportSendMock.mock.calls[0]!
    expect(args[1]).toMatchObject({ bcc: ['bcc@x.com'] })
  })

  it('reuses the same transport instance across sends with identical config', async () => {
    await sendEmail('a@x.com', 'subj 1', '<p>one</p>')
    await sendEmail('b@x.com', 'subj 2', '<p>two</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(2)
    expect(SmtpCtorMock).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the transport when the mail config changes', async () => {
    await sendEmail('a@x.com', 'subj 1', '<p>one</p>')
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: 'noreply@example.com',
          transport: 'smtp',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpPass: 'pass2',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: '',
          mailgunApiKey: '',
        },
      },
    })
    await sendEmail('b@x.com', 'subj 2', '<p>two</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(2)
    expect(SmtpCtorMock).toHaveBeenCalledTimes(2)
  })

  it('rebuilds the transport after the cache is invalidated', async () => {
    await sendEmail('a@x.com', 'subj 1', '<p>one</p>')
    invalidateMailTransportCache()
    await sendEmail('b@x.com', 'subj 2', '<p>two</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(2)
    expect(SmtpCtorMock).toHaveBeenCalledTimes(2)
  })
})

describe('infra/email/sender — sendAuthorInvite', () => {
  it('sends the invite with site title in subject', async () => {
    await sendAuthorInvite({ name: 'Bob', email: 'bob@x.com' }, 'https://link', 'Alice')
    const payload = transportSendMock.mock.calls[0]![0] as { to: string; subject: string }
    expect(payload.to).toBe('bob@x.com')
    expect(payload.subject).toContain('邀请')
  })

  it('BCCs the inviter when inviterEmail is supplied', async () => {
    await sendAuthorInvite({ name: 'Bob', email: 'bob@x.com' }, 'https://link', 'Alice', 'alice@x.com')
    const opts = transportSendMock.mock.calls[0]![1] as { bcc?: string[] }
    expect(opts.bcc).toEqual(['alice@x.com'])
  })
})

describe('infra/email/sender — sendPasswordReset / sendSignInOtp', () => {
  it('sends the password reset email', async () => {
    await sendPasswordReset({ name: 'Bob', email: 'bob@x.com' }, 'https://link')
    const payload = transportSendMock.mock.calls[0]![0] as { subject: string }
    expect(payload.subject).toContain('密码重置')
  })

  it('sends the OTP email', async () => {
    await sendSignInOtp({ name: 'Bob', email: 'bob@x.com' }, '123456')
    const payload = transportSendMock.mock.calls[0]![0] as { subject: string }
    expect(payload.subject).toContain('验证码')
  })
})

describe('infra/email/sender — sendTestMail', () => {
  it('returns unconfigured when required fields are missing', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: '',
          transport: 'smtp',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: '',
          mailgunApiKey: '',
        },
      },
    })
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
  })

  it('returns network error when transport throws', async () => {
    transportSendMock.mockRejectedValueOnce(new Error('timeout'))
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('network')
    }
  })

  it('returns upstream error on non-2xx transport result', async () => {
    transportSendMock.mockResolvedValueOnce({
      ok: false,
      reason: 'upstream',
      status: 422,
      message: '422 Unprocessable Entity',
    })
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('upstream')
    }
  })

  it('returns ok on successful transport result', async () => {
    transportSendMock.mockResolvedValueOnce({ ok: true })
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(true)
  })

  it('uses smtp transport when configured', async () => {
    transportSendMock.mockResolvedValueOnce({ ok: true })
    const result = await sendTestMail('to@x.com')
    expect(SmtpCtorMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('uses mailgun transport when configured', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: 'noreply@mg.example.com',
          transport: 'mailgun',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: 'mg.example.com',
          mailgunApiKey: 'mg-key',
        },
      },
    })
    transportSendMock.mockResolvedValueOnce({ ok: true })
    const result = await sendTestMail('to@x.com')
    expect(MailgunCtorMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('forces enabled on the built transport so test sends bypass the master switch', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          enabled: false,
          notificationEmails: true,
          sender: 'noreply@example.com',
          transport: 'smtp',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpPass: 'pass',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: '',
          mailgunApiKey: '',
        },
      },
    })
    transportSendMock.mockResolvedValueOnce({ ok: true })
    const result = await sendTestMail('to@x.com')
    expect(SmtpCtorMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
    expect(result.ok).toBe(true)
  })
})

describe('infra/email/sender — site-locale subjects', () => {
  function setSiteLocale(locale: 'en-US' | 'zh-CN'): void {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
      mail: {
        mail: {
          enabled: true,
          notificationEmails: true,
          sender: 'noreply@example.com',
          transport: 'smtp',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpPass: 'pass',
          smtpSecure: false,
          smtpRequireTls: true,
          smtpRejectUnauthorized: true,
          mailgunDomain: '',
          mailgunApiKey: '',
        },
      },
    })
  }

  function lastSubject(): string {
    const calls = transportSendMock.mock.calls
    return (calls[calls.length - 1]![0] as { subject: string }).subject
  }

  it('renders the auth-family subjects in the site locale (en-US)', async () => {
    setSiteLocale('en-US')
    const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title

    await sendAuthorInvite({ name: 'Bob', email: 'bob@x.com' }, 'https://link', 'Alice')
    expect(lastSubject()).toBe(`【${title}】Author invitation`)

    await sendPasswordReset({ name: 'Bob', email: 'bob@x.com' }, 'https://link')
    expect(lastSubject()).toBe(`【${title}】Password reset`)

    await sendSignInOtp({ name: 'Bob', email: 'bob@x.com' }, '123456')
    expect(lastSubject()).toBe(`【${title}】Sign-in verification code`)

    await sendSignInLink({ name: 'Bob', email: 'bob@x.com' }, 'https://link')
    expect(lastSubject()).toBe(`【${title}】Sign-in link`)
  })

  it('renders the test-mail subject and body in the site locale (en-US)', async () => {
    setSiteLocale('en-US')
    transportSendMock.mockResolvedValueOnce({ ok: true })

    await sendTestMail('to@x.com')

    const payload = transportSendMock.mock.calls[0]![0] as { subject: string; html: string }
    expect(payload.subject).toBe(`【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】Admin mail test`)
    expect(payload.html).toContain('This is a mail delivery test from the')
    expect(payload.html).toContain('the mail service is configured correctly')
    expect(payload.html).toContain('Site:')
    expect(payload.html).toContain('Sender:')
    expect(payload.html).toContain('Triggered at (UTC):')
    // The site title is user-authored and stays raw in every locale.
    expect(payload.html).toContain(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title)
  })

  it('localizes the readiness messages with the site locale', () => {
    setSiteLocale('en-US')
    const mail = {
      ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
      enabled: false,
    }
    const disabled = checkMailReady(mail)
    expect(disabled).toMatchObject({ ready: false, reason: 'disabled' })
    if (!disabled.ready) {
      expect(disabled.message).toBe('Mail sending is turned off in the admin panel')
    }

    const unconfigured = checkMailReady({ ...mail, enabled: true, smtpHost: '' })
    expect(unconfigured).toMatchObject({ ready: false, reason: 'unconfigured' })
    if (!unconfigured.ready) {
      expect(unconfigured.message).toBe(
        'The SMTP service is not fully configured (missing server address / username / password / sender)',
      )
    }
  })
})

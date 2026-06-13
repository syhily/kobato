import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transportSendMock = vi.fn<(payload: unknown, opts: unknown) => Promise<unknown>>()
const ZeaburCtorMock = vi.fn()

vi.mock('@/server/infra/email/transports/zeabur-zsend', () => ({
  ZeaburZSendTransport: class {
    constructor(config: unknown) {
      ZeaburCtorMock(config)
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

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import {
  checkMailReady,
  sendAuthorInvite,
  sendEmail,
  sendPasswordReset,
  sendSignInOtp,
  sendTestMail,
} from '@/server/infra/email/sender'

beforeEach(() => {
  transportSendMock.mockReset()
  ZeaburCtorMock.mockReset()
  transportSendMock.mockResolvedValue({ ok: true })
  vi.unstubAllGlobals()
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        enabled: true,
        host: 'api.zeabur.com',
        apiKey: 'k',
        sender: 'noreply@example.com',
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('infra/email/sender — checkMailReady', () => {
  it('returns disabled when enabled is false', () => {
    const result = checkMailReady({ enabled: false, host: '', apiKey: '', sender: '' })
    expect(result.ready).toBe(false)
    if (!result.ready) {
      expect(result.reason).toBe('disabled')
    }
  })

  it('returns unconfigured when host/apiKey/sender is missing', () => {
    const result = checkMailReady({ enabled: true, host: '', apiKey: '', sender: '' })
    expect(result.ready).toBe(false)
    if (!result.ready) {
      expect(result.reason).toBe('unconfigured')
    }
  })

  it('returns ready when all fields are set', () => {
    const result = checkMailReady({ enabled: true, host: 'h', apiKey: 'k', sender: 's' })
    expect(result.ready).toBe(true)
  })
})

describe('infra/email/sender — sendEmail', () => {
  it('delegates to the transport', async () => {
    const result = await sendEmail('to@x.com', 'subj', '<p>hi</p>')
    expect(transportSendMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('passes bcc through when provided', async () => {
    await sendEmail('to@x.com', 'subj', '<p>hi</p>', { bcc: ['bcc@x.com'] })
    const args = transportSendMock.mock.calls[0]!
    expect(args[1]).toMatchObject({ bcc: ['bcc@x.com'] })
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
  it('returns unconfigured when host/apiKey/sender is missing', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: { mail: { enabled: true, host: '', apiKey: '', sender: '' } },
    })
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
  })

  it('returns network error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('network')
    }
  })

  it('returns upstream error on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 422 })))
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('upstream')
    }
  })

  it('returns ok on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    const result = await sendTestMail('to@x.com')
    expect(result.ok).toBe(true)
  })
})

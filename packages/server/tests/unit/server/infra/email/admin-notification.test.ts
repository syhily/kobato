import type { Logger } from '@kobato/server/infra/logger.ts'

import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setBlogSettingsBundleForTests } = await import('@kobato/settings/tests/utils/blog-settings.ts')
const { fireAndForgetNotify, sendAdminNotification } = await import('@kobato/server/infra/email/admin-notification.ts')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('@kobato/settings/tests/utils/blog-settings.ts')

interface MailFixture {
  enabled: boolean
  transport: 'mailgun'
  mailgunDomain: string
  mailgunApiKey: string
  sender: string
}

function setMail(mail: Partial<MailFixture>) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, ...mail } },
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.unstubAllGlobals()
})

describe('email/admin-notification — sendAdminNotification', () => {
  it('sends to the site author under the 您的网站【title】 subject convention', async () => {
    setMail({
      enabled: true,
      transport: 'mailgun',
      mailgunDomain: 'mg.example.com',
      mailgunApiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await sendAdminNotification({
      subject: '有了新评论',
      element: createElement('p', null, 'stub notification body'),
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    const body = init?.body as FormData
    expect(body.get('to')).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email)
    expect(body.get('subject')).toBe(`您的网站【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】有了新评论`)
    expect(body.get('html')).toContain('stub notification body')
  })
})

describe('email/admin-notification — fireAndForgetNotify', () => {
  const settleNotify = () => new Promise((resolve) => setImmediate(resolve))

  it('swallows rejections and logs them through the given logger', async () => {
    const errorSpy = vi.fn()
    const log = { error: errorSpy } as unknown as Logger
    const failure = new Error('boom')

    fireAndForgetNotify(Promise.reject(failure), log, 'new comment')
    await settleNotify()

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith('Failed to send admin notification email', {
      kind: 'new comment',
      error: failure,
    })
  })

  it('does not log when the send resolves', async () => {
    const errorSpy = vi.fn()
    const log = { error: errorSpy } as unknown as Logger

    fireAndForgetNotify(Promise.resolve({ ok: true }), log, 'new webmention')
    await settleNotify()

    expect(errorSpy).not.toHaveBeenCalled()
  })
})

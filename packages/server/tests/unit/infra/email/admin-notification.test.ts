import type { Logger } from '@kobato/server/infra/logger'

import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { fireAndForgetNotify, sendAdminNotification } = await import('@kobato/server/infra/email/admin-notification')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

interface MailFixture {
  enabled: boolean
  host: string
  apiKey: string
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
  // Restore the global fixture installed by `tests/setup.ts` so the
  // next test in this file (and other files reusing the worker) sees a
  // hydrated snapshot.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.unstubAllGlobals()
})

describe('email/admin-notification — sendAdminNotification', () => {
  it('sends to the site author under the 您的网站【title】 subject convention', async () => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
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
    const body = JSON.parse(init?.body as string)
    expect(body.to).toEqual([TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email])
    expect(body.subject).toBe(`您的网站【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】有了新评论`)
    expect(body.html).toContain('stub notification body')
  })
})

describe('email/admin-notification — fireAndForgetNotify', () => {
  // The send promise's rejection/resolution handler is a plain microtask
  // chain — the event loop drains it fully before the next macrotask, so
  // one setImmediate turn settles fireAndForgetNotify deterministically.
  const settleNotify = () => new Promise((resolve) => setImmediate(resolve))

  it('swallows rejections and logs them through the given logger', async () => {
    const errorSpy = vi.fn()
    const log = { error: errorSpy } as unknown as Logger
    const failure = new Error('boom')

    fireAndForgetNotify(Promise.reject(failure), log, 'new comment')
    await settleNotify()

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith('failed to send new comment email', { error: failure })
  })

  it('does not log when the send resolves', async () => {
    const errorSpy = vi.fn()
    const log = { error: errorSpy } as unknown as Logger

    fireAndForgetNotify(Promise.resolve({ ok: true }), log, 'new webmention')
    await settleNotify()

    expect(errorSpy).not.toHaveBeenCalled()
  })
})

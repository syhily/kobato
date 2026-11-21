import { createCaptureMailFixture } from '@kobato/server/tests/utils/capture-mail'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const { adminMailRouter } = await import('@kobato/server/http/controllers/admin/mail.controller')

const mail = await createCaptureMailFixture()

afterAll(async () => {
  await mail.close()
})

afterEach(() => {
  mail.restore()
  vi.unstubAllGlobals()
})

describe('adminMailRouter.sendTest', () => {
  it('returns { success: true } when the mail really arrives', async () => {
    mail.useCapture()
    const ctx = makeAuthedCtx()
    const res = await call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })
    expect(res).toEqual({ success: true })

    const captured = await mail.nextMessage()
    expect(captured.to).toContain('admin@example.com')
  })

  it('throws BAD_REQUEST when mail is unconfigured', async () => {
    const ctx = makeAuthedCtx()
    await expect(call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('throws BAD_GATEWAY when the upstream provider rejects the mail', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
          enabled: true,
          sender: 'noreply@example.com',
          transport: 'mailgun',
          mailgunDomain: 'test.example',
          mailgunApiKey: 'test-key',
        },
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('502 Bad Gateway', { status: 502 })),
    )

    const ctx = makeAuthedCtx()
    await expect(call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_GATEWAY',
    })
  })
})

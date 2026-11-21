import { createCaptureMailFixture, parseMail } from '@kobato/server/tests/utils/capture-mail'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

const { sendConfirmSubscription } = await import('@kobato/server/domains/newsletter/email')

const CONFIRM_LINK = 'https://example.com/newsletter/confirm?token=abc123'

const mail = await createCaptureMailFixture()

function setSiteLocale(locale: 'en-US' | 'zh-CN'): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
    newsletter: {
      newsletter: { ...TEST_BLOG_SETTINGS_BUNDLE.newsletter!.newsletter, fromName: '', subjectPrefix: '' },
    },
  })
  mail.applyCaptureMail()
}

afterEach(() => {
  mail.restore()
})

afterAll(async () => {
  await mail.close()
})

describe('newsletter/email — sendConfirmSubscription', () => {
  it('renders the zh-CN subject and body (site title fallbacks)', async () => {
    setSiteLocale('zh-CN')
    try {
      await sendConfirmSubscription('reader@example.com', CONFIRM_LINK, 24)

      const sent = await parseMail(mail)
      const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
      expect(sent.to).toBe('reader@example.com')
      expect(sent.subject).toBe(`【${title}】请确认你的邮件订阅`)
      expect(sent.body).toContain('确认你的订阅')
      expect(sent.body).toContain(`「${title}」的邮件更新`)
      expect(sent.body).toContain('24 小时内有效')
      expect(sent.body).toContain('确认订阅')
      expect(sent.body).toContain(`href="${CONFIRM_LINK}"`)
    } finally {
      mail.restore()
    }
  })

  it('renders the en-US subject and body when the site locale is English', async () => {
    setSiteLocale('en-US')
    try {
      await sendConfirmSubscription('reader@example.com', CONFIRM_LINK, 24)

      const sent = await parseMail(mail)
      const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
      expect(sent.subject).toBe(`${title}: Please confirm your email subscription`)
      expect(sent.body).toContain('Confirm your subscription')
      expect(sent.body).toContain(`updates from ${title}`)
      expect(sent.body).toContain('valid for 24 hours')
      expect(sent.body).toContain('Confirm subscription')
      expect(sent.body).toContain(`href="${CONFIRM_LINK}"`)
    } finally {
      mail.restore()
    }
  })
})

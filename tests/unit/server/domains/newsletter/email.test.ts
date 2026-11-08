import { describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

// Capture the seam instead of hitting a transport: the subject and HTML are
// rendered here, so the site locale at send time is what these tests pin.
vi.mock('@/server/infra/email/sender', () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}))

const { sendEmail } = await import('@/server/infra/email/sender')
const { sendConfirmSubscription } = await import('@/server/domains/newsletter/email')

const CONFIRM_LINK = 'https://example.com/newsletter/confirm?token=abc123'

function lastMail(): { to: string; subject: string; html: string } {
  const calls = vi.mocked(sendEmail).mock.calls
  const [to, subject, html] = calls[calls.length - 1]!
  return { to, subject, html }
}

function setSiteLocale(locale: 'en-US' | 'zh-CN'): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
    newsletter: {
      newsletter: { ...TEST_BLOG_SETTINGS_BUNDLE.newsletter!.newsletter, fromName: '', subjectPrefix: '' },
    },
  })
}

describe('newsletter/email — sendConfirmSubscription', () => {
  it('renders the zh-CN subject and body (site title fallbacks)', async () => {
    setSiteLocale('zh-CN')
    try {
      await sendConfirmSubscription('reader@example.com', CONFIRM_LINK, 24)

      const { to, subject, html } = lastMail()
      const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
      expect(to).toBe('reader@example.com')
      expect(subject).toBe(`【${title}】请确认你的邮件订阅`)
      expect(html).toContain('确认你的订阅')
      expect(html).toContain(`「${title}」的邮件更新`)
      expect(html).toContain('24 小时内有效')
      expect(html).toContain('确认订阅')
      expect(html).toContain(`href="${CONFIRM_LINK}"`)
    } finally {
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })

  it('renders the en-US subject and body when the site locale is English', async () => {
    setSiteLocale('en-US')
    try {
      await sendConfirmSubscription('reader@example.com', CONFIRM_LINK, 24)

      const { subject, html } = lastMail()
      const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
      expect(subject).toBe(`【${title}】Please confirm your email subscription`)
      expect(html).toContain('Confirm your subscription')
      expect(html).toContain(`updates from「${title}」`)
      expect(html).toContain('valid for 24 hours')
      expect(html).toContain('Confirm subscription')
      expect(html).toContain(`href="${CONFIRM_LINK}"`)
    } finally {
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })
})

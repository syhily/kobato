import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { render } from '@/server/infra/email/render'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { ApprovedComment } from '@/server/infra/email/templates/ApprovedComment'
import { AuthorInvite } from '@/server/infra/email/templates/AuthorInvite'
import { ConfirmSubscription } from '@/server/infra/email/templates/ConfirmSubscription'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { NewReply } from '@/server/infra/email/templates/NewReply'
import { PasswordReset } from '@/server/infra/email/templates/PasswordReset'
import { SignInLink } from '@/server/infra/email/templates/SignInLink'
import { SignInOtp } from '@/server/infra/email/templates/SignInOtp'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// End-to-end template renders per family: the copy inside the HTML comes from
// the SERVER catalog, keyed by the explicit translator prop. en-US and zh-TW
// are enough to prove the seam (every key is pinned in four locales by
// `email-messages.test.ts`).

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF]/

function setSiteLocale(locale: 'en-US' | 'zh-TW'): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
  })
}

// Raw user-authored/site data (the site title) stays out of the catalog; an
// ASCII title lets the "no Han characters" assertions target the TEMPLATE copy.
function setEnglishSite(): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US', title: 'Kobato' },
  })
}

function en() {
  setEnglishSite()
  return createServerTranslator('en-US')
}

function tw() {
  setSiteLocale('zh-TW')
  return createServerTranslator('zh-TW')
}

describe('email templates — layout', () => {
  it('renders greeting, automatic-notice footer and the AppLocale lang in en-US', () => {
    setEnglishSite()
    const html = render(
      <EmailLayout t={createServerTranslator('en-US')} receiver="Bob" preview="Preheader">
        <p>body</p>
      </EmailLayout>,
    )

    expect(html).toContain('lang="en-US"')
    expect(html).toContain('Hello Bob,')
    expect(html).toContain('This email was sent automatically. Replies are not monitored.')
    expect(html).toContain('Preheader')
    expect(html).toContain('body')
    expect(html).not.toMatch(HAN)
  })

  it('renders the zh-TW layout with the site locale tag', () => {
    setSiteLocale('zh-TW')
    const html = render(
      <EmailLayout t={createServerTranslator('zh-TW')} receiver="小明">
        <p>正文</p>
      </EmailLayout>,
    )

    expect(html).toContain('lang="zh-TW"')
    expect(html).toContain('你好，小明')
    expect(html).toContain('本郵件由系統自動寄出，無法回覆。')
  })
})

describe('email templates — footer copyright (one rich-text sentence)', () => {
  it.each(SUPPORTED_LOCALES)('links only the site title and leaves the year plain in %s', (locale: AppLocale) => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale, title: 'Kobato' },
    })
    const html = render(
      <EmailLayout t={createServerTranslator(locale)} receiver="Bob">
        <p>body</p>
      </EmailLayout>,
    )

    // One catalog sentence: `<siteLink>{siteTitle}</siteLink> © {year}`.
    expect(html).toMatch(/<a [^>]*>Kobato<\/a> © \d{4}/)
    // The copyright year must never be part of the anchor.
    expect(html).not.toMatch(/© \d{4}<\/a>/)
    expect(html).not.toMatch(/<a [^>]*>Kobato © \d{4}<\/a>/)
  })
})

describe('email templates — auth family', () => {
  const link = 'https://example.com/admin/signin?token=abc'

  it('author invite: en-US title, body and CTA', () => {
    const html = render(AuthorInvite({ t: en(), receiver: 'Bob', inviter: 'Alice', link }))
    expect(html).toContain('Alice invited you to become an author')
    expect(html).toContain('You will get author permissions')
    expect(html).toContain('Accept invitation')
    expect(html).toContain(`href="${link}"`)
    expect(html).not.toMatch(HAN)
  })

  it('author invite: zh-TW CTA', () => {
    const html = render(AuthorInvite({ t: tw(), receiver: '小明', inviter: '小華', link }))
    expect(html).toContain('小華 邀請你成為站點作者')
    expect(html).toContain('接受邀請')
  })

  it('password reset: en-US and zh-TW bodies + CTA', () => {
    const english = render(PasswordReset({ t: en(), receiver: 'Bob', link }))
    expect(english).toContain('Reset your password')
    expect(english).toContain('valid for 15 minutes')
    expect(english).toContain('Reset password')

    const traditional = render(PasswordReset({ t: tw(), receiver: '小明', link }))
    expect(traditional).toContain('重設你的密碼')
    expect(traditional).toContain('重設密碼')
  })

  it('sign-in OTP: renders the code and expiry copy in both locales', () => {
    const english = render(SignInOtp({ t: en(), receiver: 'Bob', otpCode: '481516', expiresMinutes: 5 }))
    expect(english).toContain('481516')
    expect(english).toContain('expires in 5 minutes')

    const traditional = render(SignInOtp({ t: tw(), receiver: '小明', otpCode: '481516', expiresMinutes: 5 }))
    expect(traditional).toContain('481516')
    expect(traditional).toContain('5 分鐘內有效')
  })

  it('sign-in link: en-US title, body and CTA', () => {
    const html = render(SignInLink({ t: en(), receiver: 'Bob', link, expiresMinutes: 15 }))
    expect(html).toContain('Sign in to your account')
    expect(html).toContain('single use')
    expect(html).toContain('Sign in')
    expect(html).not.toMatch(HAN)
  })

  it('newsletter confirmation: sender name, expiry and CTA per locale', () => {
    const english = render(
      ConfirmSubscription({
        t: en(),
        receiver: 'reader@example.com',
        fromName: 'Kobato',
        confirmLink: 'https://example.com/confirm?token=1',
        expiresHours: 24,
      }),
    )
    expect(english).toContain('updates from Kobato')
    expect(english).toContain('valid for 24 hours')
    expect(english).toContain('Confirm subscription')

    const traditional = render(
      ConfirmSubscription({
        t: tw(),
        receiver: 'reader@example.com',
        fromName: 'Kobato',
        confirmLink: 'https://example.com/confirm?token=1',
        expiresHours: 24,
      }),
    )
    expect(traditional).toContain('「Kobato」的郵件更新')
    expect(traditional).toContain('確認訂閱')
  })
})

describe('email templates — comment family', () => {
  it('reply notification: en-US context split, labels and CTA around the user content', () => {
    const html = render(
      NewReply({
        t: en(),
        receiver: 'Bob',
        postTitle: 'Hello World',
        postLink: 'https://example.com/posts/hello/',
        sourceContent: '<p>my comment</p>',
        replyContent: '<p>the reply</p>',
        replyLink: 'https://example.com/posts/hello/#comment-2',
      }),
    )
    expect(html).toContain('Your comment in &quot;')
    expect(html).toContain('Hello World')
    expect(html).toContain('&quot; received a new reply')
    expect(html).toContain('Your comment:')
    expect(html).toContain('Reply:')
    expect(html).toContain('View reply')
    expect(html).toContain('Reset your password and sign in via this link:')
    // User-authored bodies stay raw (sanitised upstream) and never go through the catalog.
    expect(html).toContain('<p>my comment</p>')
    expect(html).toContain('<p>the reply</p>')
  })

  it('approved comment: zh-TW context, CTA and history note', () => {
    const html = render(
      ApprovedComment({
        t: tw(),
        receiver: '小明',
        postTitle: '文章標題',
        postLink: 'https://example.com/posts/hello/',
        commentContent: '<p>留言內容</p>',
        commentLink: 'https://example.com/posts/hello/#comment-1',
      }),
    )
    expect(html).toContain('你在《')
    expect(html).toContain('文章標題')
    expect(html).toContain('》中的留言，已經通過審核')
    expect(html).toContain('查看留言')
    expect(html).toContain('想要檢視與管理你的所有歷史評論')
  })

  it('admin notification layout: localized title/CTA props + zh-TW greeting', () => {
    const html = render(
      AdminNotificationEmail({
        t: tw(),
        receiver: '管理員',
        preview: '在《文章》中有一條新留言',
        title: '新留言',
        rows: [{ html: '<p>留言內容</p>' }],
        cta: { label: '查看留言', href: 'https://example.com/posts/hello/#comment-1' },
      }),
    )
    expect(html).toContain('你好，管理員')
    expect(html).toContain('新留言')
    expect(html).toContain('查看留言')
    expect(html).toContain('<p>留言內容</p>')
  })
})

#!/usr/bin/env node
import type { AppLocale } from '@kobato/i18n/locales'
import type { ServerTranslator } from '@kobato/server/infra/i18n'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONFIG_PATH = join(tmpdir(), `kobato-emails-preview-${process.pid}.json`)
process.argv.push('--config', CONFIG_PATH)
process.env.security__sessionSecret = 'email-preview-only-session-secret-000000'
process.env.security__encryptionKey = 'email-preview-only-encryption-key-000000'

const { render } = await import('@kobato/server/infra/email/render')
const { AdminNotificationEmail } = await import('@kobato/server/infra/email/templates/AdminNotificationEmail')
const { ApprovedComment } = await import('@kobato/server/infra/email/templates/ApprovedComment')
const { AuthorInvite } = await import('@kobato/server/infra/email/templates/AuthorInvite')
const { ConfirmSubscription } = await import('@kobato/server/infra/email/templates/ConfirmSubscription')
const { NewReply } = await import('@kobato/server/infra/email/templates/NewReply')
const { PasswordReset } = await import('@kobato/server/infra/email/templates/PasswordReset')
const { SignInLink } = await import('@kobato/server/infra/email/templates/SignInLink')
const { SignInOtp } = await import('@kobato/server/infra/email/templates/SignInOtp')
const { createServerTranslator } = await import('@kobato/server/infra/i18n')
const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@kobato/settings/snapshot')
const { SUPPORTED_LOCALES } = await import('@kobato/i18n/locales')
const { unsafeCast } = await import('@kobato/utils/unsafe-cast')

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'emails')

const SITE = {
  title: 'Kobato',
  website: 'https://example.com',
  timeZone: 'Asia/Shanghai',
}

function writeSnapshot(locale: AppLocale): void {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(
    unsafeCast<BlogSettingsBundle>({
      siteIdentity: {
        title: SITE.title,
        description: 'A self-hosted blog',
        website: SITE.website,
        keywords: [],
        author: { name: 'Yufan', email: 'author@example.com', url: SITE.website },
        locale,
        timeZone: SITE.timeZone,
        timeFormat: 'yyyy-MM-dd HH:mm',
        initialYear: 2024,
      },
    }),
  )
}

function templates(t: ServerTranslator) {
  return [
    {
      name: 'SignInOtp',
      make: () => SignInOtp({ t, receiver: 'reader@example.com', otpCode: '481516', expiresMinutes: 5 }),
    },
    {
      name: 'SignInLink',
      make: () =>
        SignInLink({
          t,
          receiver: 'Yufan',
          link: 'https://example.com/admin/signin?token=abc123def456',
          expiresMinutes: 15,
        }),
    },
    {
      name: 'PasswordReset',
      make: () =>
        PasswordReset({
          t,
          receiver: 'user@example.com',
          link: 'https://example.com/admin/signin?action=lostpassword&token=abc123def456',
        }),
    },
    {
      name: 'AuthorInvite',
      make: () =>
        AuthorInvite({
          t,
          receiver: 'invitee@example.com',
          inviter: 'Yufan',
          link: 'https://example.com/admin/invite?token=abcdef',
        }),
    },
    {
      name: 'NewComment',
      make: () =>
        AdminNotificationEmail({
          t,
          preview: t.format('email.newComment.preview', { title: '使用 React Router 7 搭建博客' }),
          title: t.format('email.newComment.title'),
          contextLine: {
            label: t.format('email.newComment.contextLabel'),
            link: { text: '使用 React Router 7 搭建博客', href: 'https://example.com/posts/hello-react-router' },
          },
          mutedNote: t.format('email.newComment.pendingNote'),
          rows: [{ html: '<p>写得非常清楚，已经按教程跑通了。期待下一篇。</p>' }],
          cta: {
            label: t.format('email.newComment.cta'),
            href: 'https://example.com/posts/hello-react-router#comment-1',
          },
        }),
    },
    {
      name: 'NewWebmention',
      make: () =>
        AdminNotificationEmail({
          t,
          preview: t.format('email.webmention.previewNew', { title: '使用 React Router 7 搭建博客' }),
          title: t.format('email.webmention.titleNew'),
          contextLine: {
            label: t.format('email.webmention.contextLabel'),
            link: { text: '使用 React Router 7 搭建博客', href: 'https://example.com/posts/hello-react-router' },
          },
          mutedNote: t.format('email.webmention.mutedNoteNew'),
          rows: [
            { label: t.format('email.webmention.rowSource'), value: 'React Router 学习笔记' },
            { label: t.format('email.webmention.rowAuthor'), value: 'Jane Doe' },
            { value: '照着这篇文章搭好了自己的博客，写得很清楚。' },
          ],
          cta: { label: t.format('email.webmention.cta'), href: 'https://sender.example/mentioning-post' },
        }),
    },
    {
      name: 'NewFriendApplication',
      make: () =>
        AdminNotificationEmail({
          t,
          preview: t.format('email.friendApplication.preview', { website: '小鱼的博客' }),
          title: t.format('email.friendApplication.title'),
          mutedNote: t.format('email.friendApplication.mutedNote'),
          rows: [
            { label: t.format('email.friendApplication.rowWebsite'), value: '小鱼的博客' },
            { label: t.format('email.friendApplication.rowHomepage'), value: 'https://blog.example.com' },
            { label: t.format('email.friendApplication.rowDescription'), value: '记录前端与生活' },
            { label: t.format('email.friendApplication.rowRss'), value: 'https://blog.example.com/feed.xml' },
          ],
          cta: { label: t.format('email.friendApplication.cta'), href: 'https://example.com/admin/taxonomy/friends' },
        }),
    },
    {
      name: 'NewReply',
      make: () =>
        NewReply({
          t,
          receiver: 'commenter@example.com',
          postTitle: '使用 React Router 7 搭建博客',
          postLink: 'https://example.com/posts/hello-react-router',
          sourceContent: '<p>写得非常清楚，已经按教程跑通了。</p>',
          replyContent: '<p>很高兴对你有帮助！下一篇会讲 SSR 数据加载。</p>',
          replyLink: 'https://example.com/posts/hello-react-router#comment-2',
        }),
    },
    {
      name: 'ApprovedComment',
      make: () =>
        ApprovedComment({
          t,
          receiver: 'commenter@example.com',
          postTitle: '使用 React Router 7 搭建博客',
          postLink: 'https://example.com/posts/hello-react-router',
          commentContent: '<p>写得非常清楚，已经按教程跑通了。期待下一篇。</p>',
          commentLink: 'https://example.com/posts/hello-react-router#comment-1',
        }),
    },
    {
      name: 'ConfirmSubscription',
      make: () =>
        ConfirmSubscription({
          t,
          receiver: 'reader@example.com',
          fromName: SITE.title,
          confirmLink: 'https://example.com/newsletter/confirm?token=abc123def456',
          expiresHours: 24,
        }),
    },
  ] as const
}

try {
  for (const locale of SUPPORTED_LOCALES) {
    writeSnapshot(locale)
    const t = createServerTranslator(locale)
    const dir = resolve(OUT_DIR, locale)
    mkdirSync(dir, { recursive: true })
    for (const { name, make } of templates(t)) {
      const html = render(make())
      const dest = resolve(dir, `${name}.html`)
      writeFileSync(dest, html)
      process.stdout.write(`  wrote ${dest}\n`)
    }
  }
} finally {
  rmSync(CONFIG_PATH, { force: true })
}

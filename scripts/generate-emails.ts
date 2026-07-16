#!/usr/bin/env node
//
// Renders every email template to a standalone HTML file under
// `scripts/emails/` so you can preview them in a browser.
//
//   npm run emails:generate
//
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { render } from '@/server/infra/email/render'
import { ApprovedComment } from '@/server/infra/email/templates/ApprovedComment'
import { AuthorInvite } from '@/server/infra/email/templates/AuthorInvite'
import { ConfirmSubscription } from '@/server/infra/email/templates/ConfirmSubscription'
import { NewComment } from '@/server/infra/email/templates/NewComment'
import { NewPostNotification } from '@/server/infra/email/templates/NewPostNotification'
import { NewReply } from '@/server/infra/email/templates/NewReply'
import { PasswordReset } from '@/server/infra/email/templates/PasswordReset'
import { SignInOtp } from '@/server/infra/email/templates/SignInOtp'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'emails')

BLOG_SETTINGS_SNAPSHOT_SLOT.write(
  unsafeCast<BlogSettingsBundle>({
    siteIdentity: {
      title: 'Kobato',
      description: 'A self-hosted blog',
      website: 'https://example.com',
      keywords: [],
      author: { name: 'Yufan', email: 'author@example.com', url: 'https://example.com' },
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      timeFormat: 'yyyy-MM-dd HH:mm',
      initialYear: 2024,
    },
  }),
)

const templates = [
  {
    name: 'SignInOtp',
    make: () => SignInOtp({ receiver: 'reader@example.com', otpCode: '481516', expiresMinutes: 10 }),
  },
  {
    name: 'PasswordReset',
    make: () =>
      PasswordReset({
        receiver: 'user@example.com',
        link: 'https://example.com/admin/signin?action=lostpassword&token=abc123def456',
      }),
  },
  {
    name: 'AuthorInvite',
    make: () =>
      AuthorInvite({
        receiver: 'invitee@example.com',
        inviter: 'Yufan',
        link: 'https://example.com/admin/invite?token=abcdef',
      }),
  },
  {
    name: 'NewComment',
    make: () =>
      NewComment({
        postTitle: '使用 React Router 7 搭建博客',
        postLink: 'https://example.com/posts/hello-react-router',
        commentNeedApproval: false,
        commentContent: '<p>写得非常清楚，已经按教程跑通了。期待下一篇。</p>',
        commentLink: 'https://example.com/posts/hello-react-router#comment-1',
      }),
  },
  {
    name: 'NewReply',
    make: () =>
      NewReply({
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
        receiver: 'reader@example.com',
        fromName: 'Kobato',
        confirmLink: 'https://example.com/newsletter/confirm?token=abc123def456',
        expiresHours: 24,
      }),
  },
  {
    name: 'NewPostNotification',
    make: () =>
      NewPostNotification({
        postTitle: '使用 React Router 7 搭建博客',
        postLink: 'https://example.com/posts/hello-react-router',
        postSummary: '这一篇讲如何用 React Router 7 的框架模式搭建一个支持 SSR 的博客。',
        unsubscribeLink: 'https://example.com/newsletter/unsubscribe?id=42&sig=deadbeef',
      }),
  },
] as const

mkdirSync(OUT_DIR, { recursive: true })

for (const { name, make } of templates) {
  const html = render(make())
  const dest = resolve(OUT_DIR, `${name}.html`)
  writeFileSync(dest, html)
  process.stdout.write(`  wrote ${dest}\n`)
}

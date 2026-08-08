#!/usr/bin/env node
// Renders every email template to a standalone HTML file under
// `scripts/emails/` for browser preview (`npm run emails:generate`).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { render } from '@/server/infra/email/render'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { ApprovedComment } from '@/server/infra/email/templates/ApprovedComment'
import { AuthorInvite } from '@/server/infra/email/templates/AuthorInvite'
import { ConfirmSubscription } from '@/server/infra/email/templates/ConfirmSubscription'
import { NewReply } from '@/server/infra/email/templates/NewReply'
import { PasswordReset } from '@/server/infra/email/templates/PasswordReset'
import { SignInLink } from '@/server/infra/email/templates/SignInLink'
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
    name: 'SignInLink',
    make: () =>
      SignInLink({
        receiver: 'Yufan',
        link: 'https://example.com/admin/signin?token=abc123def456',
        expiresMinutes: 15,
      }),
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
  // Admin notification layouts — one entry per notification type's data.
  {
    name: 'NewComment',
    make: () =>
      AdminNotificationEmail({
        preview: '在《使用 React Router 7 搭建博客》中有一条新留言',
        title: '新留言',
        contextLine: {
          label: '留言文章：',
          link: { text: '使用 React Router 7 搭建博客', href: 'https://example.com/posts/hello-react-router' },
        },
        mutedNote: '该留言需要审核',
        rows: [{ html: '<p>写得非常清楚，已经按教程跑通了。期待下一篇。</p>' }],
        cta: { label: '查看留言', href: 'https://example.com/posts/hello-react-router#comment-1' },
      }),
  },
  {
    name: 'NewWebmention',
    make: () =>
      AdminNotificationEmail({
        preview: '《使用 React Router 7 搭建博客》收到一条新的 Webmention',
        title: '新 Webmention',
        contextLine: {
          label: '目标文章：',
          link: { text: '使用 React Router 7 搭建博客', href: 'https://example.com/posts/hello-react-router' },
        },
        mutedNote: '该提及已通过来源校验，等待审核',
        rows: [
          { label: '来源：', value: 'React Router 学习笔记' },
          { label: '作者：', value: 'Jane Doe' },
          { value: '照着这篇文章搭好了自己的博客，写得很清楚。' },
        ],
        cta: { label: '查看来源', href: 'https://sender.example/mentioning-post' },
      }),
  },
  {
    name: 'NewFriendApplication',
    make: () =>
      AdminNotificationEmail({
        preview: '「小鱼的博客」申请交换友链',
        title: '新友链申请',
        mutedNote: '该申请等待审核，通过后才会在公共页面展示',
        rows: [
          { label: '站名：', value: '小鱼的博客' },
          { label: '主页：', value: 'https://blog.example.com' },
          { label: '简介：', value: '记录前端与生活' },
          { label: 'RSS：', value: 'https://blog.example.com/feed.xml' },
        ],
        cta: { label: '前往审核', href: 'https://example.com/admin/taxonomy/friends' },
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
] as const

mkdirSync(OUT_DIR, { recursive: true })

for (const { name, make } of templates) {
  const html = render(make())
  const dest = resolve(OUT_DIR, `${name}.html`)
  writeFileSync(dest, html)
  process.stdout.write(`  wrote ${dest}\n`)
}

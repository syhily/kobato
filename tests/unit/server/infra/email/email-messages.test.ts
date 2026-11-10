import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'
import type { ServerMessageId } from '@/shared/i18n/messages/server/en-US'

import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { serverMessagesEnUS } from '@/shared/i18n/messages/server/en-US'

// Every system-email string (layout, subjects, bodies, labels, CTA copy) must exist,
// translated, in all four server catalogs. Server-only on purpose: this copy never enters
// the client UI payload.
interface Case {
  key: ServerMessageId
  params?: Record<string, string | number>
  /** Rich-text message: tags are rendered as their plain chunks (text comparison only). */
  rich?: boolean
  messages: Record<AppLocale, string>
}

function formatCase(entry: Case, locale: AppLocale): string {
  const t = createServerTranslator(locale)
  if (entry.rich !== true) {
    return t.format(entry.key, entry.params)
  }
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      t.formatRich(entry.key, {
        ...entry.params,
        siteLink: (chunks: React.ReactNode[]) => chunks.join(''),
      }),
    ),
  )
}

const CASES: Case[] = [
  {
    key: 'email.adminNotification.subject',
    params: { siteTitle: 'Kobato', subject: 'Subject' },
    messages: {
      'en-US': 'Kobato: Subject',
      'zh-CN': '您的网站【Kobato】Subject',
      'zh-TW': '您的網站【Kobato】Subject',
      'zh-HK': '您的網站【Kobato】Subject',
    },
  },
  {
    key: 'email.authorInvite.body',
    messages: {
      'en-US':
        'You will get author permissions to publish and manage posts. Click the button below to accept the invitation (valid for 7 days).',
      'zh-CN': '你将获得作者权限，可以发布和管理文章。请点击下方按钮接受邀请（7 天内有效）。',
      'zh-TW': '你將獲得作者權限，可以發布和管理文章。請點擊下方按鈕接受邀請（7 天內有效）。',
      'zh-HK': '你將獲得作者權限，可以發布和管理文章。請點擊下方按鈕接受邀請（7 天內有效）。',
    },
  },
  {
    key: 'email.authorInvite.cta',
    messages: {
      'en-US': 'Accept invitation',
      'zh-CN': '接受邀请',
      'zh-TW': '接受邀請',
      'zh-HK': '接受邀請',
    },
  },
  {
    key: 'email.authorInvite.defaultInviter',
    messages: {
      'en-US': 'An administrator',
      'zh-CN': '管理员',
      'zh-TW': '管理員',
      'zh-HK': '管理員',
    },
  },
  {
    key: 'email.authorInvite.ignore',
    messages: {
      'en-US': 'If you did not expect this invitation, you can ignore this email.',
      'zh-CN': '如果你并未收到此邀请，请忽略此邮件。',
      'zh-TW': '如果你並未收到此邀請，請忽略此郵件。',
      'zh-HK': '如果你並未收到此邀請，請忽略此郵件。',
    },
  },
  {
    key: 'email.authorInvite.preview',
    params: { inviter: 'Alice', siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Alice invited you to write for Kobato',
      'zh-CN': 'Alice 邀请你成为《Kobato》的作者',
      'zh-TW': 'Alice 邀請你成為《Kobato》的作者',
      'zh-HK': 'Alice 邀請你成為《Kobato》的作者',
    },
  },
  {
    key: 'email.authorInvite.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Author invitation',
      'zh-CN': '【Kobato】作者邀请',
      'zh-TW': '【Kobato】作者邀請',
      'zh-HK': '【Kobato】作者邀請',
    },
  },
  {
    key: 'email.authorInvite.title',
    params: { inviter: 'Alice' },
    messages: {
      'en-US': 'Alice invited you to become an author',
      'zh-CN': 'Alice 邀请你成为站点作者',
      'zh-TW': 'Alice 邀請你成為站點作者',
      'zh-HK': 'Alice 邀請你成為站點作者',
    },
  },
  {
    key: 'email.commentApproved.contextPrefix',
    messages: {
      'en-US': 'Your comment in "',
      'zh-CN': '你在《',
      'zh-TW': '你在《',
      'zh-HK': '你在《',
    },
  },
  {
    key: 'email.commentApproved.contextSuffix',
    messages: {
      'en-US': '" has been approved',
      'zh-CN': '》中的留言，已经通过审核',
      'zh-TW': '》中的留言，已經通過審核',
      'zh-HK': '》中的留言，已經通過審核',
    },
  },
  {
    key: 'email.commentApproved.cta',
    messages: {
      'en-US': 'View comment',
      'zh-CN': '查看留言',
      'zh-TW': '查看留言',
      'zh-HK': '查看留言',
    },
  },
  {
    key: 'email.commentApproved.preview',
    params: { postTitle: 'Hello' },
    messages: {
      'en-US': 'Your comment in "Hello" has been approved',
      'zh-CN': '你在《Hello》中的留言已通过审核',
      'zh-TW': '你在《Hello》中的留言已通過審核',
      'zh-HK': '你在《Hello》中的留言已通過審核',
    },
  },
  {
    key: 'email.commentApproved.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Your comment on Kobato has been approved',
      'zh-CN': '您在【Kobato】的留言已经通过审核',
      'zh-TW': '您在【Kobato】的留言已經通過審核',
      'zh-HK': '您在【Kobato】的留言已經通過審核',
    },
  },
  {
    key: 'email.commentApproved.title',
    messages: {
      'en-US': 'Your comment has been approved',
      'zh-CN': '你的留言已通过审核',
      'zh-TW': '你的留言已通過審核',
      'zh-HK': '你的留言已通過審核',
    },
  },
  {
    key: 'email.common.automaticNotice',
    messages: {
      'en-US': 'This email was sent automatically. Replies are not monitored.',
      'zh-CN': '本邮件由系统自动发出，无法回复。',
      'zh-TW': '本郵件由系統自動寄出，無法回覆。',
      'zh-HK': '本郵件由系統自動發出，無法回覆。',
    },
  },
  {
    key: 'email.common.commentHistoryNote',
    messages: {
      'en-US': 'Want to view and manage all your past comments? Reset your password and sign in via this link:',
      'zh-CN': '想要查看与管理你的所有历史评论？通过此链接重置密码登录即可：',
      'zh-TW': '想要檢視與管理你的所有歷史評論？透過此連結重設密碼登入即可：',
      'zh-HK': '想要檢視與管理你的所有歷史評論？透過此連結重設密碼登入即可：',
    },
  },
  {
    key: 'email.common.copyright',
    rich: true,
    params: { siteTitle: 'Kobato', year: 2026 },
    messages: {
      'en-US': 'Kobato © 2026',
      'zh-CN': 'Kobato © 2026',
      'zh-TW': 'Kobato © 2026',
      'zh-HK': 'Kobato © 2026',
    },
  },
  {
    key: 'email.common.greeting',
    params: { receiver: 'Bob' },
    messages: {
      'en-US': 'Hello Bob,',
      'zh-CN': '你好，Bob',
      'zh-TW': '你好，Bob',
      'zh-HK': '你好，Bob',
    },
  },
  {
    key: 'email.error.disabled',
    messages: {
      'en-US': 'Mail sending is turned off in the admin panel',
      'zh-CN': '邮件发送已在管理面板中关闭',
      'zh-TW': '郵件傳送已在管理面板中關閉',
      'zh-HK': '郵件傳送已在管理面板中關閉',
    },
  },
  {
    key: 'email.error.mailgunUnconfigured',
    messages: {
      'en-US': 'The Mailgun service is not fully configured (missing domain / API key / sender)',
      'zh-CN': 'Mailgun 服务尚未配置完整（缺少 Domain / API Key / 发件人）',
      'zh-TW': 'Mailgun 服務尚未設定完整（缺少 Domain / API Key / 寄件人）',
      'zh-HK': 'Mailgun 服務尚未設定完整（缺少 Domain / API Key / 寄件人）',
    },
  },
  {
    key: 'email.error.smtpUnconfigured',
    messages: {
      'en-US': 'The SMTP service is not fully configured (missing server address / username / password / sender)',
      'zh-CN': 'SMTP 服务尚未配置完整（缺少服务器地址 / 用户名 / 密码 / 发件人）',
      'zh-TW': 'SMTP 服務尚未設定完整（缺少伺服器位址 / 使用者名稱 / 密碼 / 寄件人）',
      'zh-HK': 'SMTP 服務尚未設定完整（缺少伺服器位址 / 使用者名稱 / 密碼 / 寄件人）',
    },
  },
  {
    key: 'email.error.targetMissing',
    messages: {
      'en-US': 'The comment target no longer exists',
      'zh-CN': '评论目标已不存在',
      'zh-TW': '評論目標已不存在',
      'zh-HK': '評論目標已不存在',
    },
  },
  {
    key: 'email.friendApplication.cta',
    messages: {
      'en-US': 'Review it',
      'zh-CN': '前往审核',
      'zh-TW': '前往審核',
      'zh-HK': '前往審核',
    },
  },
  {
    key: 'email.friendApplication.mutedNote',
    messages: {
      'en-US': 'The application is awaiting review; it appears publicly only after approval',
      'zh-CN': '该申请等待审核，通过后才会在公共页面展示',
      'zh-TW': '該申請等待審核，通過後才會在公共頁面展示',
      'zh-HK': '該申請等待審核，通過後才會在公共頁面展示',
    },
  },
  {
    key: 'email.friendApplication.preview',
    params: { website: 'blog.example.com' },
    messages: {
      'en-US': '"blog.example.com" applied for a friend link',
      'zh-CN': '「blog.example.com」申请交换友链',
      'zh-TW': '「blog.example.com」申請交換友鏈',
      'zh-HK': '「blog.example.com」申請交換友鏈',
    },
  },
  {
    key: 'email.friendApplication.rowDescription',
    messages: {
      'en-US': 'Description:',
      'zh-CN': '简介：',
      'zh-TW': '簡介：',
      'zh-HK': '簡介：',
    },
  },
  {
    key: 'email.friendApplication.rowHomepage',
    messages: {
      'en-US': 'Homepage:',
      'zh-CN': '主页：',
      'zh-TW': '首頁：',
      'zh-HK': '首頁：',
    },
  },
  {
    key: 'email.friendApplication.rowRss',
    messages: {
      'en-US': 'RSS:',
      'zh-CN': 'RSS：',
      'zh-TW': 'RSS：',
      'zh-HK': 'RSS：',
    },
  },
  {
    key: 'email.friendApplication.rowWebsite',
    messages: {
      'en-US': 'Site:',
      'zh-CN': '站名：',
      'zh-TW': '站名：',
      'zh-HK': '站名：',
    },
  },
  {
    key: 'email.friendApplication.subjectSuffix',
    messages: {
      'en-US': 'New friend-link application',
      'zh-CN': '收到了新的友链申请',
      'zh-TW': '收到了新的友鏈申請',
      'zh-HK': '收到了新的友鏈申請',
    },
  },
  {
    key: 'email.friendApplication.title',
    messages: {
      'en-US': 'New friend-link application',
      'zh-CN': '新友链申请',
      'zh-TW': '新友鏈申請',
      'zh-HK': '新友鏈申請',
    },
  },
  {
    key: 'email.newComment.contextLabel',
    messages: {
      'en-US': 'Post:',
      'zh-CN': '留言文章：',
      'zh-TW': '留言文章：',
      'zh-HK': '留言文章：',
    },
  },
  {
    key: 'email.newComment.cta',
    messages: {
      'en-US': 'View comment',
      'zh-CN': '查看留言',
      'zh-TW': '查看留言',
      'zh-HK': '查看留言',
    },
  },
  {
    key: 'email.newComment.pendingNote',
    messages: {
      'en-US': 'This comment needs review',
      'zh-CN': '该留言需要审核',
      'zh-TW': '該留言需要審核',
      'zh-HK': '該留言需要審核',
    },
  },
  {
    key: 'email.newComment.preview',
    params: { title: 'Hello' },
    messages: {
      'en-US': 'A new comment in "Hello"',
      'zh-CN': '在《Hello》中有一条新留言',
      'zh-TW': '在《Hello》中有一條新留言',
      'zh-HK': '在《Hello》中有一條新留言',
    },
  },
  {
    key: 'email.newComment.subjectSuffix',
    messages: {
      'en-US': 'New comment',
      'zh-CN': '有了新评论',
      'zh-TW': '有了新評論',
      'zh-HK': '有了新評論',
    },
  },
  {
    key: 'email.newComment.title',
    messages: {
      'en-US': 'New comment',
      'zh-CN': '新留言',
      'zh-TW': '新留言',
      'zh-HK': '新留言',
    },
  },
  {
    key: 'email.newReply.contextPrefix',
    messages: {
      'en-US': 'Your comment in "',
      'zh-CN': '你在《',
      'zh-TW': '你在《',
      'zh-HK': '你在《',
    },
  },
  {
    key: 'email.newReply.contextSuffix',
    messages: {
      'en-US': '" received a new reply',
      'zh-CN': '》中的留言，有了新回复',
      'zh-TW': '》中的留言，有了新回覆',
      'zh-HK': '》中的留言，有了新回覆',
    },
  },
  {
    key: 'email.newReply.cta',
    messages: {
      'en-US': 'View reply',
      'zh-CN': '查看回复',
      'zh-TW': '查看回覆',
      'zh-HK': '查看回覆',
    },
  },
  {
    key: 'email.newReply.preview',
    params: { postTitle: 'Hello' },
    messages: {
      'en-US': 'Your comment in "Hello" received a new reply',
      'zh-CN': '在《Hello》中你的留言有了新回复',
      'zh-TW': '在《Hello》中你的留言有了新回覆',
      'zh-HK': '在《Hello》中你的留言有了新回覆',
    },
  },
  {
    key: 'email.newReply.replyLabel',
    messages: {
      'en-US': 'Reply:',
      'zh-CN': '回复内容：',
      'zh-TW': '回覆內容：',
      'zh-HK': '回覆內容：',
    },
  },
  {
    key: 'email.newReply.sourceLabel',
    messages: {
      'en-US': 'Your comment:',
      'zh-CN': '你的留言：',
      'zh-TW': '你的留言：',
      'zh-HK': '你的留言：',
    },
  },
  {
    key: 'email.newReply.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Your comment on Kobato received a new reply',
      'zh-CN': '您在【Kobato】的留言有了新回复',
      'zh-TW': '您在【Kobato】的留言有了新回覆',
      'zh-HK': '您在【Kobato】的留言有了新回覆',
    },
  },
  {
    key: 'email.newReply.title',
    messages: {
      'en-US': 'Your comment received a new reply',
      'zh-CN': '你的留言有了新回复',
      'zh-TW': '你的留言有了新回覆',
      'zh-HK': '你的留言有了新回覆',
    },
  },
  {
    key: 'email.newsletterConfirm.body',
    params: { fromName: 'Kobato', expiresHours: 24 },
    messages: {
      'en-US': 'You asked to subscribe to updates from Kobato. Click the button below to confirm (valid for 24 hours):',
      'zh-CN': '你请求订阅「Kobato」的邮件更新，请点击下方按钮确认订阅（24 小时内有效）：',
      'zh-TW': '你請求訂閱「Kobato」的郵件更新，請點擊下方按鈕確認訂閱（24 小時內有效）：',
      'zh-HK': '你請求訂閱「Kobato」的郵件更新，請點擊下方按鈕確認訂閱（24 小時內有效）：',
    },
  },
  {
    key: 'email.newsletterConfirm.cta',
    messages: {
      'en-US': 'Confirm subscription',
      'zh-CN': '确认订阅',
      'zh-TW': '確認訂閱',
      'zh-HK': '確認訂閱',
    },
  },
  {
    key: 'email.newsletterConfirm.ignore',
    messages: {
      'en-US':
        'If you did not request this subscription, you can ignore this email. You will not receive anything until you confirm.',
      'zh-CN': '如果你并未请求订阅，请忽略此邮件 —— 未确认前你不会收到任何更新。',
      'zh-TW': '如果你並未請求訂閱，請忽略此郵件 —— 未確認前你不會收到任何更新。',
      'zh-HK': '如果你並未請求訂閱，請忽略此郵件 —— 未確認前你不會收到任何更新。',
    },
  },
  {
    key: 'email.newsletterConfirm.preview',
    params: { fromName: 'Kobato' },
    messages: {
      'en-US': 'Confirm your subscription to updates from Kobato',
      'zh-CN': '确认订阅来自「Kobato」的邮件更新',
      'zh-TW': '確認訂閱來自「Kobato」的郵件更新',
      'zh-HK': '確認訂閱來自「Kobato」的郵件更新',
    },
  },
  {
    key: 'email.newsletterConfirm.subject',
    params: { subjectPrefix: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Please confirm your email subscription',
      'zh-CN': '【Kobato】请确认你的邮件订阅',
      'zh-TW': '【Kobato】請確認你的郵件訂閱',
      'zh-HK': '【Kobato】請確認你的郵件訂閱',
    },
  },
  {
    key: 'email.newsletterConfirm.title',
    messages: {
      'en-US': 'Confirm your subscription',
      'zh-CN': '确认你的订阅',
      'zh-TW': '確認你的訂閱',
      'zh-HK': '確認你的訂閱',
    },
  },
  {
    key: 'email.notification.adminCta',
    messages: {
      'en-US': 'Open the admin panel',
      'zh-CN': '前往管理后台',
      'zh-TW': '前往管理後台',
      'zh-HK': '前往管理後台',
    },
  },
  {
    key: 'email.notification.adminSubject',
    params: { siteTitle: 'Kobato', title: 'Hello' },
    messages: {
      'en-US': 'Kobato: System alert: Hello',
      'zh-CN': '【Kobato】系统提醒：Hello',
      'zh-TW': '【Kobato】系統提醒：Hello',
      'zh-HK': '【Kobato】系統提醒：Hello',
    },
  },
  {
    key: 'email.notification.adminTitle',
    messages: {
      'en-US': 'System alert',
      'zh-CN': '系统提醒',
      'zh-TW': '系統提醒',
      'zh-HK': '系統提醒',
    },
  },
  {
    key: 'email.notification.directCta',
    messages: {
      'en-US': 'Visit the site',
      'zh-CN': '访问站点',
      'zh-TW': '造訪站點',
      'zh-HK': '造訪站點',
    },
  },
  {
    key: 'email.notification.directSubject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'You received a new direct message on Kobato',
      'zh-CN': '您在【Kobato】收到一条新私信',
      'zh-TW': '您在【Kobato】收到一條新私訊',
      'zh-HK': '您在【Kobato】收到一條新私訊',
    },
  },
  {
    key: 'email.notification.directTitle',
    messages: {
      'en-US': 'New direct message',
      'zh-CN': '新私信',
      'zh-TW': '新私訊',
      'zh-HK': '新私訊',
    },
  },
  {
    key: 'email.notification.footerNote',
    messages: {
      'en-US':
        'This email was triggered by a system notification. You can turn notification emails off in Settings > Mail.',
      'zh-CN': '此邮件由系统通知触发，可在「系统设置 → 邮件」中关闭通知邮件。',
      'zh-TW': '此郵件由系統通知觸發，可在「系統設定 → 郵件」中關閉通知郵件。',
      'zh-HK': '此郵件由系統通知觸發，可在「系統設定 → 郵件」中關閉通知郵件。',
    },
  },
  {
    key: 'email.notification.rowBody',
    messages: {
      'en-US': 'Content:',
      'zh-CN': '内容：',
      'zh-TW': '內容：',
      'zh-HK': '內容：',
    },
  },
  {
    key: 'email.notification.rowTitle',
    messages: {
      'en-US': 'Title:',
      'zh-CN': '标题：',
      'zh-TW': '標題：',
      'zh-HK': '標題：',
    },
  },
  {
    key: 'email.passwordReset.body',
    messages: {
      'en-US': 'You requested a password reset. Click the button below to set a new password (valid for 15 minutes):',
      'zh-CN': '你请求重置登录密码，请点击下方按钮重置密码（15 分钟内有效）：',
      'zh-TW': '你請求重設登入密碼，請點擊下方按鈕重設密碼（15 分鐘內有效）：',
      'zh-HK': '你請求重設登入密碼，請點擊下方按鈕重設密碼（15 分鐘內有效）：',
    },
  },
  {
    key: 'email.passwordReset.cta',
    messages: {
      'en-US': 'Reset password',
      'zh-CN': '重置密码',
      'zh-TW': '重設密碼',
      'zh-HK': '重設密碼',
    },
  },
  {
    key: 'email.passwordReset.ignore',
    messages: {
      'en-US': 'If you did not request a password reset, you can ignore this email.',
      'zh-CN': '如果你并未请求重置密码，请忽略此邮件。',
      'zh-TW': '如果你並未請求重設密碼，請忽略此郵件。',
      'zh-HK': '如果你並未請求重設密碼，請忽略此郵件。',
    },
  },
  {
    key: 'email.passwordReset.preview',
    messages: {
      'en-US': 'You requested a sign-in password reset; the link is valid for 15 minutes',
      'zh-CN': '你请求重置登录密码，15 分钟内有效',
      'zh-TW': '你請求重設登入密碼，15 分鐘內有效',
      'zh-HK': '你請求重設登入密碼，15 分鐘內有效',
    },
  },
  {
    key: 'email.passwordReset.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Password reset',
      'zh-CN': '【Kobato】密码重置',
      'zh-TW': '【Kobato】密碼重設',
      'zh-HK': '【Kobato】密碼重設',
    },
  },
  {
    key: 'email.passwordReset.title',
    messages: {
      'en-US': 'Reset your password',
      'zh-CN': '重置你的密码',
      'zh-TW': '重設你的密碼',
      'zh-HK': '重設你的密碼',
    },
  },
  {
    key: 'email.signInLink.body',
    params: { expiresMinutes: 15 },
    messages: {
      'en-US': 'You requested to sign in. Click the button below to continue (valid for 15 minutes, single use):',
      'zh-CN': '你请求登录账号，请点击下方按钮完成登录（15 分钟内有效，仅可使用一次）：',
      'zh-TW': '你請求登入帳號，請點擊下方按鈕完成登入（15 分鐘內有效，僅可使用一次）：',
      'zh-HK': '你請求登入帳號，請點擊下方按鈕完成登入（15 分鐘內有效，僅可使用一次）：',
    },
  },
  {
    key: 'email.signInLink.cta',
    messages: {
      'en-US': 'Sign in',
      'zh-CN': '登录',
      'zh-TW': '登入',
      'zh-HK': '登入',
    },
  },
  {
    key: 'email.signInLink.ignore',
    messages: {
      'en-US': 'If you did not request this sign-in, you can ignore this email.',
      'zh-CN': '如果你并未请求登录，请忽略此邮件。',
      'zh-TW': '如果你並未請求登入，請忽略此郵件。',
      'zh-HK': '如果你並未請求登入，請忽略此郵件。',
    },
  },
  {
    key: 'email.signInLink.preview',
    params: { expiresMinutes: 15 },
    messages: {
      'en-US': 'You requested a sign-in link; it expires in 15 minutes',
      'zh-CN': '你请求登录账号，链接 15 分钟内有效',
      'zh-TW': '你請求登入帳號，連結 15 分鐘內有效',
      'zh-HK': '你請求登入帳號，連結 15 分鐘內有效',
    },
  },
  {
    key: 'email.signInLink.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Sign-in link',
      'zh-CN': '【Kobato】登录链接',
      'zh-TW': '【Kobato】登入連結',
      'zh-HK': '【Kobato】登入連結',
    },
  },
  {
    key: 'email.signInLink.title',
    messages: {
      'en-US': 'Sign in to your account',
      'zh-CN': '登录你的账号',
      'zh-TW': '登入你的帳號',
      'zh-HK': '登入你的帳號',
    },
  },
  {
    key: 'email.signInOtp.body',
    messages: {
      'en-US': 'You are signing in to the admin panel. Enter the code below to continue:',
      'zh-CN': '你正在尝试登录后台管理，请输入以下验证码完成登录：',
      'zh-TW': '你正在嘗試登入後台管理，請輸入以下驗證碼完成登入：',
      'zh-HK': '你正在嘗試登入後台管理，請輸入以下驗證碼完成登入：',
    },
  },
  {
    key: 'email.signInOtp.note',
    params: { expiresMinutes: 15 },
    messages: {
      'en-US':
        'The code expires in 15 minutes. Do not share it with anyone. If this was not you, you can ignore this email.',
      'zh-CN': '验证码 15 分钟内有效，请勿将验证码告知他人。如非本人操作，请忽略此邮件。',
      'zh-TW': '驗證碼 15 分鐘內有效，請勿將驗證碼告知他人。如非本人操作，請忽略此郵件。',
      'zh-HK': '驗證碼 15 分鐘內有效，請勿將驗證碼告知他人。如非本人操作，請忽略此郵件。',
    },
  },
  {
    key: 'email.signInOtp.preview',
    params: { otpCode: '481516', expiresMinutes: 15 },
    messages: {
      'en-US': 'Your sign-in code is 481516; it expires in 15 minutes',
      'zh-CN': '你的登录验证码是 481516，15 分钟内有效',
      'zh-TW': '你的登入驗證碼是 481516，15 分鐘內有效',
      'zh-HK': '你的登入驗證碼是 481516，15 分鐘內有效',
    },
  },
  {
    key: 'email.signInOtp.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Sign-in verification code',
      'zh-CN': '【Kobato】登录验证码',
      'zh-TW': '【Kobato】登入驗證碼',
      'zh-HK': '【Kobato】登入驗證碼',
    },
  },
  {
    key: 'email.testMail.bodyOk',
    messages: {
      'en-US': 'If you received this email, the mail service is configured correctly.',
      'zh-CN': '如果你收到了这封邮件，说明邮件服务配置工作正常。',
      'zh-TW': '如果你收到了這封郵件，說明郵件服務設定正常。',
      'zh-HK': '如果你收到了這封郵件，說明郵件服務設定正常。',
    },
  },
  {
    key: 'email.testMail.introPrefix',
    messages: {
      'en-US': 'This is a mail delivery test from the ',
      'zh-CN': '这是一封来自 ',
      'zh-TW': '這是一封來自 ',
      'zh-HK': '這是一封來自 ',
    },
  },
  {
    key: 'email.testMail.introSuffix',
    messages: {
      'en-US': ' admin panel.',
      'zh-CN': ' 后台的邮件发送测试。',
      'zh-TW': ' 後台的郵件傳送測試。',
      'zh-HK': ' 後台的郵件傳送測試。',
    },
  },
  {
    key: 'email.testMail.labelSender',
    messages: {
      'en-US': 'Sender:',
      'zh-CN': '发件人：',
      'zh-TW': '寄件人：',
      'zh-HK': '寄件人：',
    },
  },
  {
    key: 'email.testMail.labelSite',
    messages: {
      'en-US': 'Site:',
      'zh-CN': '站点：',
      'zh-TW': '站點：',
      'zh-HK': '站點：',
    },
  },
  {
    key: 'email.testMail.labelTriggered',
    messages: {
      'en-US': 'Triggered at (UTC):',
      'zh-CN': '触发时间（UTC）：',
      'zh-TW': '觸發時間（UTC）：',
      'zh-HK': '觸發時間（UTC）：',
    },
  },
  {
    key: 'email.testMail.subject',
    params: { siteTitle: 'Kobato' },
    messages: {
      'en-US': 'Kobato: Admin mail test',
      'zh-CN': '【Kobato】管理员邮件测试',
      'zh-TW': '【Kobato】管理員郵件測試',
      'zh-HK': '【Kobato】管理員郵件測試',
    },
  },
  {
    key: 'email.webmention.contextLabel',
    messages: {
      'en-US': 'Target post:',
      'zh-CN': '目标文章：',
      'zh-TW': '目標文章：',
      'zh-HK': '目標文章：',
    },
  },
  {
    key: 'email.webmention.cta',
    messages: {
      'en-US': 'View source',
      'zh-CN': '查看来源',
      'zh-TW': '查看來源',
      'zh-HK': '查看來源',
    },
  },
  {
    key: 'email.webmention.mutedNoteNew',
    messages: {
      'en-US': 'The mention passed source verification and is awaiting review',
      'zh-CN': '该提及已通过来源校验，等待审核',
      'zh-TW': '該提及已通過來源校驗，等待審核',
      'zh-HK': '該提及已通過來源校驗，等待審核',
    },
  },
  {
    key: 'email.webmention.mutedNoteUpdated',
    messages: {
      'en-US': 'The mention was updated and already passed source verification; it is awaiting re-review',
      'zh-CN': '该提及的内容已更新，已通过来源校验，等待重新审核',
      'zh-TW': '該提及的內容已更新，已通過來源校驗，等待重新審核',
      'zh-HK': '該提及的內容已更新，已通過來源校驗，等待重新審核',
    },
  },
  {
    key: 'email.webmention.previewNew',
    params: { title: 'Hello' },
    messages: {
      'en-US': '"Hello" received a new Webmention',
      'zh-CN': '《Hello》收到一条新的 Webmention',
      'zh-TW': '《Hello》收到一條新的 Webmention',
      'zh-HK': '《Hello》收到一條新的 Webmention',
    },
  },
  {
    key: 'email.webmention.previewUpdated',
    params: { title: 'Hello' },
    messages: {
      'en-US': 'A Webmention for "Hello" was updated',
      'zh-CN': '《Hello》的一条 Webmention 内容已更新',
      'zh-TW': '《Hello》的一條 Webmention 內容已更新',
      'zh-HK': '《Hello》的一條 Webmention 內容已更新',
    },
  },
  {
    key: 'email.webmention.rowAuthor',
    messages: {
      'en-US': 'Author:',
      'zh-CN': '作者：',
      'zh-TW': '作者：',
      'zh-HK': '作者：',
    },
  },
  {
    key: 'email.webmention.rowSource',
    messages: {
      'en-US': 'Source:',
      'zh-CN': '来源：',
      'zh-TW': '來源：',
      'zh-HK': '來源：',
    },
  },
  {
    key: 'email.webmention.subjectSuffixNew',
    messages: {
      'en-US': 'New Webmention received',
      'zh-CN': '收到了新的 Webmention',
      'zh-TW': '收到了新的 Webmention',
      'zh-HK': '收到了新的 Webmention',
    },
  },
  {
    key: 'email.webmention.subjectSuffixUpdated',
    messages: {
      'en-US': 'Webmention content updated; awaiting re-review',
      'zh-CN': 'Webmention 内容已更新，等待重新审核',
      'zh-TW': 'Webmention 內容已更新，等待重新審核',
      'zh-HK': 'Webmention 內容已更新，等待重新審核',
    },
  },
  {
    key: 'email.webmention.titleNew',
    messages: {
      'en-US': 'New Webmention',
      'zh-CN': '新 Webmention',
      'zh-TW': '新 Webmention',
      'zh-HK': '新 Webmention',
    },
  },
  {
    key: 'email.webmention.titleUpdated',
    messages: {
      'en-US': 'Webmention updated',
      'zh-CN': 'Webmention 已更新',
      'zh-TW': 'Webmention 已更新',
      'zh-HK': 'Webmention 已更新',
    },
  },
]

describe('server email messages — four locales', () => {
  it('covers every email.* key in the server catalog', () => {
    const tableKeys = new Set(CASES.map((entry) => entry.key))
    const catalogKeys = (Object.keys(serverMessagesEnUS) as ServerMessageId[]).filter((key) => key.startsWith('email.'))
    expect(catalogKeys.filter((key) => !tableKeys.has(key))).toEqual([])
  })

  it.each(CASES)('$key resolves in every locale', (entry) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(formatCase(entry, locale)).toBe(entry.messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', (entry) => {
    expect(formatCase(entry, 'en-US')).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})

describe('English server catalog copy', () => {
  // Catalog TEMPLATES use ASCII punctuation. User-supplied values (site titles,
  // post titles, error text) legitimately contain any script — this scans the
  // templates, never a formatted message, so no proper noun is forbidden.
  // The class covers General Punctuation (em dash), arrows, CJK punctuation
  // and fullwidth forms; `©` (U+00A9) is not in it.
  const NON_ASCII_PUNCTUATION = /[\u2010-\u206F\u2190-\u21FF\u3000-\u303F\uFE30-\uFE4F\uFF00-\uFFEF]/gu

  it('uses ASCII punctuation in every server template', () => {
    const offenders = Object.entries(serverMessagesEnUS)
      .map(([key, message]) => ({ key, marks: [...new Set(message.match(NON_ASCII_PUNCTUATION) ?? [])] }))
      .filter((entry) => entry.marks.length > 0)
    expect(offenders).toEqual([])
  })
})

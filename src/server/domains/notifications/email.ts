import { createElement } from 'react'

import type { Database } from '@/server/infra/db/database'
import type { NotificationRow } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'

import { findUserEmailsByIds, findUserNamesByIds } from '@/server/infra/db/operations/notification'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@/shared/config/getters'

const log = getLogger('notifications.email')

/** ADR-0008 opt-out copy — the settings path the reader can follow to turn this class off. */
export const NOTIFICATION_EMAIL_FOOTER = '此邮件由系统通知触发，可在「系统设置 → 邮件」中关闭通知邮件。'

/**
 * The email side effect is ON only when mail itself is enabled (the master
 * switch still wins) AND the section's own toggle is not off. A missing
 * snapshot/section reads as OFF: boot-time producers can run before settings
 * hydration, and an email must never break them.
 */
function notificationEmailsEnabled(): boolean {
  const mail = getBlogSettingsBundleSync()?.mail?.mail
  return mail?.enabled === true && mail.notificationEmails !== false
}

function notificationEmailSubject(row: NotificationRow, siteTitle: string): string {
  return row.kind === 'admin' ? `【${siteTitle}】系统提醒：${row.title}` : `您在【${siteTitle}】收到一条新私信`
}

function renderNotificationEmail(
  row: NotificationRow,
  site: { title: string; website: string },
  receiver: string,
): string {
  const isAdminAlert = row.kind === 'admin'
  return render(
    createElement(AdminNotificationEmail, {
      receiver,
      preview: row.title,
      title: isAdminAlert ? '系统提醒' : '新私信',
      // Notification title/body are plain text — React escapes them at render.
      rows: [
        { label: '标题：', value: row.title },
        { label: '内容：', value: row.body },
      ],
      cta: isAdminAlert
        ? { label: '前往管理后台', href: `${site.website.replace(/\/+$/, '')}/admin` }
        : { label: '访问站点', href: site.website },
      footerNote: NOTIFICATION_EMAIL_FOOTER,
    }),
  )
}

function logSendResult(notificationId: number, to: string, result: SendResult): void {
  // An `ok:false` result is a normal, logged skip (disabled / unconfigured /
  // upstream) — never an error the producer could have seen.
  if (!result.ok) {
    log.warn('notification email not sent', { notificationId, to, reason: result.reason })
  }
}

/**
 * One email per recipient, sequentially (no batching exists in the mail
 * pipeline). Broadcasts are deliberately excluded (ADR-0008): they fan out to
 * every user, which is exactly the class email is not for.
 */
export async function sendNotificationEmail(
  db: Database,
  row: NotificationRow,
  recipientIds: readonly number[],
): Promise<void> {
  if (row.kind === 'broadcast' || !notificationEmailsEnabled()) {
    return
  }
  const emails = findUserEmailsByIds(db, recipientIds)
  if (emails.size === 0) {
    return
  }
  const names = findUserNamesByIds(db, [...emails.keys()])
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const subject = notificationEmailSubject(row, siteIdentity.title)
  for (const [userId, email] of emails) {
    try {
      const html = renderNotificationEmail(row, siteIdentity, names.get(userId) ?? siteIdentity.author.name)
      const result = await sendEmail(email, subject, html)
      logSendResult(row.id, email, result)
    } catch (error) {
      // One bad recipient must not starve the rest of the fan-out.
      log.error('failed to send notification email', { notificationId: row.id, error })
    }
  }
}

/**
 * Producer-facing seam: fire-and-forget so an SMTP outage never delays,
 * errors, or rolls back the in-app fan-out that already committed (ADR-0008).
 */
export function queueNotificationEmail(db: Database, row: NotificationRow, recipientIds: readonly number[]): void {
  fireAndForgetNotify(sendNotificationEmail(db, row, recipientIds), log, 'notification')
}

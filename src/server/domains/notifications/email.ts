import { createElement } from 'react'

import type { ResolvedNotificationMessage } from '@/server/domains/notifications/message'
import type { Database } from '@/server/infra/db/database'
import type { NotificationRow } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'
import type { ServerTranslator } from '@/server/infra/i18n'

import { resolveNotificationMessage } from '@/server/domains/notifications/message'
import { findUserEmailsByIds, findUserNamesByIds } from '@/server/infra/db/operations/notification'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { emailTranslator } from '@/server/infra/email/translator'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@/shared/config/getters'

const log = getLogger('notifications.email')

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

function notificationEmailSubject(row: NotificationRow, siteTitle: string, t: ServerTranslator, title: string): string {
  return t.format(row.kind === 'admin' ? 'email.notification.adminSubject' : 'email.notification.directSubject', {
    siteTitle,
    title,
  })
}

function renderNotificationEmail(
  row: NotificationRow,
  site: { title: string; website: string },
  receiver: string,
  t: ServerTranslator,
  message: ResolvedNotificationMessage,
): string {
  const isAdminAlert = row.kind === 'admin'
  return render(
    createElement(AdminNotificationEmail, {
      t,
      receiver,
      preview: message.title,
      title: t.format(isAdminAlert ? 'email.notification.adminTitle' : 'email.notification.directTitle'),
      // The resolver's output is plain text — React escapes it at render.
      rows: [
        { label: t.format('email.notification.rowTitle'), value: message.title },
        { label: t.format('email.notification.rowBody'), value: message.body },
      ],
      cta: isAdminAlert
        ? {
            label: t.format('email.notification.adminCta'),
            href: `${site.website.replace(/\/+$/, '')}/admin`,
          }
        : { label: t.format('email.notification.directCta'), href: site.website },
      footerNote: t.format('email.notification.footerNote'),
    }),
  )
}

function logSendResult(notificationId: number, userId: number, result: SendResult): void {
  // An `ok:false` result is a normal, logged skip (disabled / unconfigured /
  // upstream) — never an error the producer could have seen.
  if (!result.ok) {
    log.warn('notification email not sent', { notificationId, userId, reason: result.reason })
  }
}

/**
 * One email per recipient, sequentially (no batching exists in the mail
 * pipeline). Broadcasts are deliberately excluded: they fan out to every
 * user, which is exactly the class email is not for.
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
  const t = emailTranslator()
  // One resolver call per row: the subject and the body always agree, and the
  // same function feeds the inbox/thread read paths.
  const message = resolveNotificationMessage(row, t)
  const subject = notificationEmailSubject(row, siteIdentity.title, t, message.title)
  for (const [userId, email] of emails) {
    try {
      const html = renderNotificationEmail(row, siteIdentity, names.get(userId) ?? siteIdentity.author.name, t, message)
      const result = await sendEmail(email, subject, html)
      logSendResult(row.id, userId, result)
    } catch (error) {
      // One bad recipient must not starve the rest of the fan-out.
      log.error('failed to send notification email', { notificationId: row.id, error })
    }
  }
}

/**
 * Producer-facing seam: fire-and-forget so an SMTP outage never delays,
 * errors, or rolls back the in-app fan-out that already committed.
 */
export function queueNotificationEmail(db: Database, row: NotificationRow, recipientIds: readonly number[]): void {
  fireAndForgetNotify(sendNotificationEmail(db, row, recipientIds), log, 'notification')
}

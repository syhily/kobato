import type { Database } from '@kobato/db/database.ts'
import type { NotificationRow } from '@kobato/db/types.ts'
import type { ResolvedNotificationMessage } from '@kobato/server/domains/notifications/message.ts'
import type { SendResult } from '@kobato/server/infra/email/types.ts'
import type { ServerTranslator } from '@kobato/server/infra/i18n.ts'

import { findUserEmailsByIds, findUserNamesByIds } from '@kobato/db/operations/notification.ts'
import { resolveNotificationMessage } from '@kobato/server/domains/notifications/message.ts'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification.ts'
import { render } from '@kobato/server/infra/email/render.tsx'
import { sendEmail } from '@kobato/server/infra/email/sender.ts'
import { AdminNotificationEmail } from '@kobato/server/infra/email/templates/AdminNotificationEmail.tsx'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { createElement } from 'react'

const log = getLogger('notifications.email')

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
  if (!result.ok) {
    log.warn('notification email not sent', { notificationId, userId, reason: result.reason })
  }
}

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
  const message = resolveNotificationMessage(row, t)
  const subject = notificationEmailSubject(row, siteIdentity.title, t, message.title)
  for (const [userId, email] of emails) {
    try {
      const html = renderNotificationEmail(row, siteIdentity, names.get(userId) ?? siteIdentity.author.name, t, message)
      const result = await sendEmail(email, subject, html)
      logSendResult(row.id, userId, result)
    } catch (error) {
      log.error('failed to send notification email', { notificationId: row.id, error })
    }
  }
}

export function queueNotificationEmail(db: Database, row: NotificationRow, recipientIds: readonly number[]): void {
  fireAndForgetNotify(sendNotificationEmail(db, row, recipientIds), log, 'notification')
}

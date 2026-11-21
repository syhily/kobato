import type { NotificationDto } from '@kobato/api/contracts/notifications'
import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { LucideIcon } from 'lucide-react'

import { NOTIFICATION_SOURCES } from '@kobato/api/contracts/notifications'
import { formatRelativeTime } from '@kobato/utils/format'
import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react'

export interface NotificationMeta {
  icon: LucideIcon
  kindLabelId: UiMessageId
}

const [ZEABUR_MAIL_CLEANUP_SOURCE, JOB_RUN_SOURCE] = NOTIFICATION_SOURCES

export function notificationMeta(item: Pick<NotificationDto, 'kind' | 'source'>): NotificationMeta {
  if (item.source === ZEABUR_MAIL_CLEANUP_SOURCE) {
    return { icon: MailWarningIcon, kindLabelId: 'notifications.kind.system' }
  }
  if (item.source === JOB_RUN_SOURCE) {
    return { icon: WrenchIcon, kindLabelId: 'notifications.kind.job' }
  }
  switch (item.kind) {
    case 'direct':
      return { icon: MessageSquareIcon, kindLabelId: 'notifications.kind.direct' }
    case 'admin':
      return { icon: ShieldAlertIcon, kindLabelId: 'notifications.kind.admin' }
    case 'broadcast':
      return { icon: MegaphoneIcon, kindLabelId: 'notifications.kind.broadcast' }
  }
}

export interface NotificationTimeOptions {
  locale: AppLocale
  timeZone: string
  now: number | Date
}

export function formatNotificationTime(iso: string, options: NotificationTimeOptions): string {
  const { locale, timeZone, now } = options
  return formatRelativeTime(iso, { locale, timeZone, now: new Date(now) })
}

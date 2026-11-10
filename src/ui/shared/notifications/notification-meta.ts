import type { LucideIcon } from 'lucide-react'

import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react'

import type { NotificationDto } from '@/shared/contracts/notifications'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { NOTIFICATION_SOURCES } from '@/shared/contracts/notifications'
import { formatRelativeTime } from '@/shared/i18n/format'

export interface NotificationMeta {
  icon: LucideIcon
  /** Kind label message id — the consumer resolves it with its own `t`. */
  kindLabelId: UiMessageId
}

const [ZEABUR_MAIL_CLEANUP_SOURCE, JOB_RUN_SOURCE] = NOTIFICATION_SOURCES

// Kind drives the default chrome; `source` lets system producers override the icon (the Zeabur
// cleanup alert reads as a mail problem, not a generic one).
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
  /** The SITE time zone — calendar-day math for the "yesterday"-style buckets. */
  timeZone: string
  /** Reference instant from `useNow()`; the same value for every call in a render pass. */
  now: number | Date
}

/** Relative "3 minutes ago"-style label through the shared relative-time facade; one `now` per render pass. */
export function formatNotificationTime(iso: string, options: NotificationTimeOptions): string {
  const { locale, timeZone, now } = options
  return formatRelativeTime(iso, { locale, timeZone, now: new Date(now) })
}

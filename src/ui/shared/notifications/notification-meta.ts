import type { LucideIcon } from 'lucide-react'

import { formatDistance } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react'

import { NOTIFICATION_SOURCES, type NotificationDto } from '@/shared/contracts/notifications'

export interface NotificationMeta {
  icon: LucideIcon
  kindLabel: string
}

const [ZEABUR_MAIL_CLEANUP_SOURCE, JOB_RUN_SOURCE] = NOTIFICATION_SOURCES

// Kind drives the default chrome; `source` lets system producers override the
// icon (the Zeabur cleanup alert reads as a mail problem, not a generic one).
export function notificationMeta(item: Pick<NotificationDto, 'kind' | 'source'>): NotificationMeta {
  if (item.source === ZEABUR_MAIL_CLEANUP_SOURCE) {
    return { icon: MailWarningIcon, kindLabel: '系统提醒' }
  }
  if (item.source === JOB_RUN_SOURCE) {
    return { icon: WrenchIcon, kindLabel: '任务提醒' }
  }
  switch (item.kind) {
    case 'direct':
      return { icon: MessageSquareIcon, kindLabel: '私信' }
    case 'admin':
      return { icon: ShieldAlertIcon, kindLabel: '管理员消息' }
    case 'broadcast':
      return { icon: MegaphoneIcon, kindLabel: '公告' }
  }
}

/**
 * "3 分钟前"-style label. `now` lets a ticking clock (see
 * `@/client/hooks/use-now`) refresh the text without remounting; pass the
 * same value to every call in a render pass so labels agree.
 */
export function formatNotificationTime(iso: string, now: number | Date = Date.now()): string {
  return formatDistance(new Date(iso), now, { addSuffix: true, locale: zhCN })
}

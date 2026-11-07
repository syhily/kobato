import type { LucideIcon } from 'lucide-react'

import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon } from 'lucide-react'

import type { NotificationDto } from '@/shared/contracts/notifications'

export interface NotificationMeta {
  icon: LucideIcon
  kindLabel: string
}

// Kind drives the default chrome; `source` lets system producers override the
// icon (the Zeabur cleanup alert reads as a mail problem, not a generic one).
export function notificationMeta(item: Pick<NotificationDto, 'kind' | 'source'>): NotificationMeta {
  if (item.source === 'zeabur-mail-cleanup') {
    return { icon: MailWarningIcon, kindLabel: '系统提醒' }
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

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso)
  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
}

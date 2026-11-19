import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

export const NOTIFICATION_KINDS = ['direct', 'admin', 'broadcast'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_TABS = ['all', 'unread', 'direct', 'announce'] as const
export type NotificationTab = (typeof NOTIFICATION_TABS)[number]

export const NOTIFICATION_SOURCES = ['zeabur-mail-cleanup', 'job-run'] as const
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number]

export const notificationSenderDto = z.object({
  id: idString,
  name: z.string(),
})
export type NotificationSenderDto = z.infer<typeof notificationSenderDto>

export const notificationDto = z.object({
  id: idString,
  threadId: idString,
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string(),
  body: z.string(),
  sender: notificationSenderDto.nullable(),
  replyable: z.boolean(),
  source: z.string().nullable(),
  actionUrl: z.string().nullable(),
  createdAt: isoDateTime,
  read: z.boolean(),
})
export type NotificationDto = z.infer<typeof notificationDto>

export const listNotificationsInput = z.object({
  tab: z.enum(NOTIFICATION_TABS).default('all'),
  cursor: idString.optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export const listNotificationsOutput = z.object({
  items: z.array(notificationDto),
  nextCursor: idString.nullable(),
})

export const unreadCountOutput = z.object({
  count: z.number().int(),
})

export const markNotificationsReadInput = z.object({
  ids: z.array(idString).min(1).max(100).optional(),
})

export const markNotificationsUnreadInput = z.object({
  ids: z.array(idString).min(1).max(100),
})

export const threadMessageDto = z.object({
  id: idString,
  body: z.string(),
  sender: notificationSenderDto.nullable(),
  mine: z.boolean(),
  createdAt: isoDateTime,
})
export type ThreadMessageDto = z.infer<typeof threadMessageDto>

export const notificationThreadInput = z.object({
  threadId: idString,
})

export const notificationThreadOutput = z.object({
  messages: z.array(threadMessageDto),
  canReply: z.boolean(),
})

export const replyNotificationInput = z.object({
  threadId: idString,
  body: z.string().trim().min(1, 'notifications.validation.replyBody').max(5000),
})

export const replyNotificationOutput = z.object({
  message: threadMessageDto,
  threadId: idString,
})

export const adminSendDirectInput = z.object({
  userId: idString,
  title: z.string().trim().min(1, 'notifications.validation.title').max(120),
  body: z.string().trim().min(1, 'notifications.validation.body').max(5000),
})

export const adminSendBroadcastInput = z.object({
  title: z.string().trim().min(1, 'notifications.validation.title').max(120),
  body: z.string().trim().min(1, 'notifications.validation.body').max(5000),
  replyable: z.boolean().default(false),
})

export const adminSendOutput = z.object({
  id: idString,
})

export const adminRecallNotificationInput = z.object({
  id: idString,
})

export const adminRecallNotificationOutput = z.object({
  id: idString,
  recalledAt: isoDateTime,
})

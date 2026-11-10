import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

// Notification kinds: `direct` (admin ↔ user private thread, always
// replyable), `admin` (system-generated, fanned out to every admin at creation,
// never replyable), `broadcast` (system- or admin-created, fanned out to every
// user at creation; only the admin-created flavor is replyable).
export const NOTIFICATION_KINDS = ['direct', 'admin', 'broadcast'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_TABS = ['all', 'unread', 'direct', 'announce'] as const
export type NotificationTab = (typeof NOTIFICATION_TABS)[number]

// System-producer vocabulary. The WIRE field stays `z.string().nullable()`:
// stored rows may outlive the vocabulary, so the read schema never narrows.
export const NOTIFICATION_SOURCES = ['zeabur-mail-cleanup', 'job-run'] as const
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number]

export const notificationSenderDto = z.object({
  id: idString,
  name: z.string(),
})
export type NotificationSenderDto = z.infer<typeof notificationSenderDto>

// One inbox row. `sender: null` marks a system-generated message.
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
  // Omitted = mark every unread message of the caller.
  ids: z.array(idString).min(1).max(100).optional(),
})

// The inverse gesture ("deal with this later") — ids are REQUIRED: there is
// deliberately no "unread everything".
export const markNotificationsUnreadInput = z.object({
  ids: z.array(idString).min(1).max(100),
})

// One thread message in the detail view. `mine` drives the chat alignment.
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
  // Whether the caller may post a reply into this thread.
  canReply: z.boolean(),
})

// Validation messages are UI message IDS (never prose): the client renders them
// through `localizeMessage`, the server maps them with `messageDescriptor`.
export const replyNotificationInput = z.object({
  threadId: idString,
  body: z.string().trim().min(1, 'notifications.validation.replyBody').max(5000),
})

export const replyNotificationOutput = z.object({
  message: threadMessageDto,
  // The thread the reply landed in. A broadcast reply forks a new private
  // thread, so this differs from the input thread id — the UI uses the
  // mismatch to explain where the reply went.
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

// Soft-delete recall: broadcasts and admin-kind system messages are recallable,
// direct messages are not. Idempotent on the server side.
export const adminRecallNotificationInput = z.object({
  id: idString,
})

export const adminRecallNotificationOutput = z.object({
  id: idString,
  recalledAt: isoDateTime,
})

import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

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

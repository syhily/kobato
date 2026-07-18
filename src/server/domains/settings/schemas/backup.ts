import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const backupSchema = z
  .object({
    scheduled: z.object({
      enabled: coerceBoolean,
      frequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      hour: z.coerce.number().int().min(0).max(23).default(3),
      minute: z.union([z.literal(0), z.literal(30)]).default(0),
      dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
    }),
    retention: z.object({
      enabled: coerceBoolean.default(true),
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.scheduled.enabled) {
      return
    }
    if (value.scheduled.frequency === 'weekly' && value.scheduled.dayOfWeek === undefined) {
      ctx.addIssue({ code: 'custom', path: ['scheduled', 'dayOfWeek'], message: '请选择星期几' })
    }
    if (value.scheduled.frequency === 'monthly' && value.scheduled.dayOfMonth === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduled', 'dayOfMonth'],
        message: '请选择每月日期',
      })
    }
  })

import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

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
    encryption: z
      .object({
        enabled: coerceBoolean,
        // Like every settings secret: `undefined` means "keep the stored
        // value", any string (including empty) is a deliberate overwrite.
        password: z.string().max(512).optional(),
      })
      // Rows written before the encryption field existed carry no key — the
      // default keeps them valid.
      .default({ enabled: false, password: '' }),
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
  .superRefine((value, ctx) => {
    if (!value.encryption.enabled) {
      return
    }
    // The merged view carries the stored (encrypted) password when the patch
    // omits it — only an explicitly empty or short password is rejectable here.
    if (
      value.encryption.password !== undefined &&
      value.encryption.password.length > 0 &&
      value.encryption.password.length < 8
    ) {
      ctx.addIssue({ code: 'custom', path: ['encryption', 'password'], message: '备份加密密码至少 8 位' })
    }
  })

export const backupDefaults = {
  scheduled: { enabled: false, frequency: 'daily' as const, hour: 3, minute: 0 },
  retention: { enabled: true, days: 30 },
  encryption: { enabled: false, password: '' },
} as const

export const backupSection = {
  scope: 'blog.backup',
  key: 'backup',
  schema: backupSchema,
  defaults: backupDefaults,
} as const

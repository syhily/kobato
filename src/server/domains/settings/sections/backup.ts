import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

/** Custom validation messages: typed ids; numeric bounds ride `params`. */
export const backupValidationMessages = {
  dayOfWeekRequired: 'admin.settings.backup.error.dayOfWeekRequired',
  dayOfMonthRequired: 'admin.settings.backup.error.dayOfMonthRequired',
  encryptionPasswordRequired: 'admin.settings.backup.error.encryptionPasswordRequired',
  encryptionPasswordTooShort: 'admin.settings.backup.error.encryptionPasswordTooShort',
} as const satisfies Record<string, UiMessageId>

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
      ctx.addIssue({
        code: 'custom',
        path: ['scheduled', 'dayOfWeek'],
        message: backupValidationMessages.dayOfWeekRequired,
      })
    }
    if (value.scheduled.frequency === 'monthly' && value.scheduled.dayOfMonth === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduled', 'dayOfMonth'],
        message: backupValidationMessages.dayOfMonthRequired,
      })
    }
  })
  .superRefine((value, ctx) => {
    if (!value.encryption.enabled) {
      return
    }
    // The merged view carries the stored (encrypted) password when the patch
    // omits it. Enabled with NO password (never set, or explicitly cleared)
    // would silently write PLAINTEXT archives while the UI claims encryption
    // — fail closed instead of degrading.
    const password = value.encryption.password
    if (password === undefined || password.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['encryption', 'password'],
        message: backupValidationMessages.encryptionPasswordRequired,
      })
      return
    }
    if (password.length > 0 && password.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['encryption', 'password'],
        message: backupValidationMessages.encryptionPasswordTooShort,
        params: { min: 8 },
      })
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

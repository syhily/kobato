import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

// Mail provider configuration (Zeabur ZSend / SMTP / Mailgun). `apiKey` and `smtpPass`
// are optional: `undefined` means "keep the existing value", any string (including
// empty) is a deliberate overwrite (pivoted in `applySectionPatch`, not here).
export const mailSchema = z.object({
  mail: z.object({
    enabled: coerceBoolean,
    // Zeabur ZSend fields
    host: z.string().trim().max(253).default(''),
    apiKey: z.string().trim().max(512).optional(),
    sender: z.union([z.literal(''), z.email()]).default(''),
    transport: z.enum(['zeabur', 'smtp', 'mailgun']).default('zeabur'),
    // SMTP fields
    smtpHost: z.string().trim().max(253).default(''),
    smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
    smtpUser: z.string().trim().max(512).default(''),
    smtpPass: z.string().trim().max(512).optional(),
    smtpSecure: coerceBoolean.default(false),
    smtpRequireTls: coerceBoolean.default(true),
    smtpRejectUnauthorized: coerceBoolean.default(true),
    // Mailgun fields
    mailgunDomain: z.string().trim().max(253).default(''),
    mailgunApiKey: z.string().trim().max(512).optional(),
  }),
})

export const mailDefaults = {
  mail: {
    enabled: false,
    host: 'api.zeabur.com',
    apiKey: '',
    sender: 'noreply@example.com',
    transport: 'zeabur',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: false,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: '',
    mailgunApiKey: '',
  },
} as const

export const mailSection = {
  scope: 'blog.mail',
  key: 'mail',
  schema: mailSchema,
  defaults: mailDefaults,
} as const

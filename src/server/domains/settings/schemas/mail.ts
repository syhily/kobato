import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

// Mail provider configuration. Supports Zeabur ZSend (HTTP) and SMTP.
//
// `apiKey` and `smtpPass` are optional so the admin form can save other
// fields without re-pasting the secret on every edit: the perimeter treats
// `undefined` (or omitted) as "keep the existing value" and any string
// (including empty) as a deliberate overwrite. The "always overwrite empty"
// pivot happens in `applySectionPatch`, not here, so the schema stays a
// pure shape validator.
export const mailSchema = z.object({
  mail: z.object({
    enabled: coerceBoolean,
    // Zeabur ZSend fields
    host: z.string().trim().max(253).default(''),
    apiKey: z.string().trim().max(512).optional(),
    sender: z.union([z.literal(''), z.email()]).default(''),
    // Vendor selector for the mail dispatcher.
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
export type MailInput = z.infer<typeof mailSchema>

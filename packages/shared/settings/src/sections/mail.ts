import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { coerceBoolean } from '@kobato/settings/sections/shared.ts'
import { z } from 'zod'

export const mailValidationMessages = {
  hostnameInvalid: 'admin.settings.mail.error.hostnameInvalid',
} as const satisfies Record<string, UiMessageId>

// Mailgun interpolates the domain into `https://api.mailgun.net/v3/<domain>/messages`,
// so it is a hostname — never a URL, port, path, or IP literal. Empty means
// "provider not configured yet" and stays valid.
const HOSTNAME_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i
const NUMERIC_LABEL = /^\d+$/

function isMailHostname(value: string): boolean {
  const labels = value.split('.')
  if (labels.length < 2) {
    return false
  }
  if (labels.every((label) => NUMERIC_LABEL.test(label))) {
    return false
  }
  return labels.every((label) => HOSTNAME_LABEL.test(label))
}

const mailHostname = z
  .string()
  .trim()
  .max(253)
  .default('')
  .refine((value) => value === '' || isMailHostname(value), {
    message: mailValidationMessages.hostnameInvalid,
  })

export const mailSchema = z.object({
  mail: z.object({
    enabled: coerceBoolean,
    notificationEmails: coerceBoolean.default(true),
    sender: z.union([z.literal(''), z.email()]).default(''),
    transport: z.enum(['smtp', 'mailgun']).default('smtp').catch('smtp'),
    smtpHost: z.string().trim().max(253).default(''),
    smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
    smtpUser: z.string().trim().max(512).default(''),
    smtpPass: z.string().trim().max(512).optional(),
    smtpSecure: coerceBoolean.default(false),
    smtpRequireTls: coerceBoolean.default(true),
    smtpRejectUnauthorized: coerceBoolean.default(true),
    mailgunDomain: mailHostname,
    mailgunApiKey: z.string().trim().max(512).optional(),
  }),
})

export const mailDefaults = {
  mail: {
    enabled: false,
    notificationEmails: true,
    sender: 'noreply@example.com',
    transport: 'smtp',
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

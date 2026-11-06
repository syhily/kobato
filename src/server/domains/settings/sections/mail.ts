import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

// ZSend interpolates the host into `https://<host>/api/v1/zsend/emails` and
// Mailgun into `https://api.mailgun.net/v3/<domain>/messages`, so both are
// hostnames — never URLs, ports, paths, or IP literals. Empty means "provider
// not configured yet" and stays valid.
const HOSTNAME_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i
const NUMERIC_LABEL = /^\d+$/

function isMailHostname(value: string): boolean {
  const labels = value.split('.')
  // Always a dotted name (api.zeabur.com, mg.example.com) — a bare label
  // cannot be a provider endpoint.
  if (labels.length < 2) {
    return false
  }
  // IPv4 literals are all-numeric labels; IPv6 literals (`[::1]`) fail the
  // label pattern. Mail providers route by name, so reject both.
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
    message: '请填写主机名或域名（只能包含字母 / 数字 / `-` / `.`），不能带协议、端口、路径或 IP 地址',
  })

// Mail provider configuration (Zeabur ZSend / SMTP / Mailgun). `apiKey` and `smtpPass`
// are optional: `undefined` means "keep the existing value", any string (including
// empty) is a deliberate overwrite (pivoted in `applySectionPatch`, not here).
export const mailSchema = z.object({
  mail: z.object({
    enabled: coerceBoolean,
    // Zeabur ZSend fields
    host: mailHostname,
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
    mailgunDomain: mailHostname,
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

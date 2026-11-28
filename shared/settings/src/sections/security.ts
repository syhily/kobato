import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { coerceBoolean } from '@kobato/settings/sections/shared'
import { z } from 'zod'

export const securityValidationMessages = {
  dangerousExemptPath: 'admin.settings.security.error.dangerousExemptPath',
} as const satisfies Record<string, UiMessageId>

const DANGEROUS_EXEMPT_PREFIXES = ['/rpc', '/api'] as const

function isDangerousExemptPath(path: string): boolean {
  const normalized = path.trim()
  if (normalized === '/') {
    return true
  }
  return DANGEROUS_EXEMPT_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

export const securitySchema = z.object({
  csrf: z.object({
    enabled: coerceBoolean,
    exemptPaths: z
      .array(z.string().trim().min(1))
      .max(20)
      .default([])
      .refine((paths: string[]) => !paths.some(isDangerousExemptPath), {
        message: securityValidationMessages.dangerousExemptPath,
      }),
  }),
  cors: z
    .object({
      enabled: coerceBoolean,
      origins: z.array(z.string().trim().min(1).max(253)).max(20).default([]),
    })
    .default({ enabled: false, origins: [] }),
  passkey: z
    .object({
      enabled: coerceBoolean,
    })
    .default({ enabled: false }),
})

export const securityDefaults = {
  csrf: { enabled: true, exemptPaths: [] },
  cors: { enabled: false, origins: [] },
  passkey: { enabled: false },
} as const

export const securitySection = {
  scope: 'blog.security',
  key: 'security',
  schema: securitySchema,
  defaults: securityDefaults,
} as const

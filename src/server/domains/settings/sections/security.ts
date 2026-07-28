import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

function isDangerousExemptPath(path: string): boolean {
  const normalized = path.trim()
  return normalized === '/' || normalized === '/rpc' || normalized === '/rpc/' || normalized.startsWith('/rpc/')
}

export const securitySchema = z.object({
  csrf: z.object({
    enabled: coerceBoolean,
    exemptPaths: z
      .array(z.string().trim().min(1))
      .max(20)
      .default([])
      .refine((paths: string[]) => !paths.some(isDangerousExemptPath), {
        message:
          'Exempt paths cannot blanket-disable CSRF for all RPC endpoints. Paths starting with /rpc/ are not allowed.',
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

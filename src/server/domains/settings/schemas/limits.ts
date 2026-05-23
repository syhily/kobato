import { z } from 'zod'

export const limitsSchema = z.object({
  maxRequestBodySize: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  sessionMaxAge: z.coerce
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 60 * 60)
    .default(60 * 60 * 24 * 30),
  auditLogDbRetentionDays: z.coerce.number().int().min(1).max(90).default(30),
  auditLogArchiveRetentionDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(365 * 2)
    .default(180),
})
export type LimitsInput = z.infer<typeof limitsSchema>

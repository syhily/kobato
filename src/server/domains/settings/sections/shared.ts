import { z } from 'zod'

// Boolean that also accepts the string literals "true" / "false" (e.g. from form data).
export const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

export const sortOrderSchema = z.enum(['asc', 'desc'])

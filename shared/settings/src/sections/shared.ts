import { z } from 'zod'

export const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

export const sortOrderSchema = z.enum(['asc', 'desc'])

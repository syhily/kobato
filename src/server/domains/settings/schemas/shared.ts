import { z } from 'zod'

// Strict boolean that also accepts the string literals "true" / "false"
// (e.g. from form data) without the surprising `Boolean("false") === true`
// behaviour of `coerceBoolean`.
export const coerceBoolean = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

export const sortOrderSchema = z.enum(['asc', 'desc'])

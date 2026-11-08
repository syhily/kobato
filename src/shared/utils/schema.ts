import { z } from 'zod'

/**
 * Boolean coercion that handles string "true"/"false" — unlike
 * `z.coerce.boolean()` (Boolean("false") === true). Use this wherever
 * you'd reach for `z.coerce.boolean()`.
 */
export function safeBoolean() {
  return z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
}

const HONEYPOT_MAX_LENGTH = 240

export function honeypotField<const TName extends string>(name: TName) {
  return {
    schema: z.string().max(HONEYPOT_MAX_LENGTH).optional().default(''),
    refine: (value: Record<TName, string>, ctx: z.RefinementCtx) => {
      if (value[name].trim().length > 0) {
        ctx.addIssue({
          code: 'custom',
          // Typed validation id: the server maps it to a descriptor and the
          // client resolves it through `localizeMessage`.
          message: 'validation.form.invalidInput',
          path: [name],
        })
      }
    },
  }
}

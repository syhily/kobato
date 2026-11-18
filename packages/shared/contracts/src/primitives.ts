import { z } from 'zod'

export const idString = z.string().regex(/^\d+$/, 'numeric id required')
export const isoDateTime = z.iso.datetime()

export const markdownHeadingDto = z.object({
  depth: z.number().int().min(1).max(6),
  slug: z.string(),
  text: z.string(),
})

export function safeBoolean() {
  return z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
}

// Shared boolean success envelope for single-gesture admin mutations.
export const successDto = z.object({ success: z.boolean() })
export type SuccessOutput = z.infer<typeof successDto>

// Shared literal-ok envelope for anonymous submissions that must not reveal
// whether the address/record was ever seen.
export const okDto = z.object({ ok: z.literal(true) })
export type OkOutput = z.infer<typeof okDto>

// Shared void output for procedures that only mutate (nothing crosses back).
export const voidOutput = z.void()

const HONEYPOT_MAX_LENGTH = 240

export function honeypotField<const TName extends string>(name: TName) {
  return {
    schema: z.string().max(HONEYPOT_MAX_LENGTH).optional().default(''),
    refine: (value: Record<TName, string>, ctx: z.RefinementCtx) => {
      if (value[name].trim().length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.form.invalidInput',
          path: [name],
        })
      }
    },
  }
}

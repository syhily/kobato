import { z } from 'zod'

/**
 * Safe boolean coercion that correctly handles string "true"/"false".
 *
 * `z.coerce.boolean()` uses JavaScript's `Boolean()` under the hood, which
 * means `Boolean("false") === true`. That turns a checkbox that a user
 * un-checked into `true` on the wire — exactly the opposite of what they
 * intended.
 *
 * Use this everywhere you'd reach for `z.coerce.boolean()`.
 */
export function safeBoolean() {
  return z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
}

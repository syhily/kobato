import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

// Mail / Zeabur ZSend integration. The host is bounded to a hostname
// (no scheme — the sender hard-codes `https://`), the API key is left
// permissive because Zeabur tokens have no documented format, and the
// sender must be a valid email so the upstream API doesn't 4xx the
// payload before we get any feedback.
//
// `apiKey` is optional so the admin form can save other fields without
// re-pasting the secret on every edit: the perimeter treats `undefined`
// (or omitted) as "keep the existing value" and any string (including
// empty) as a deliberate overwrite. The "always overwrite empty" pivot
// happens in `applySectionPatch`, not here, so the schema stays a pure
// shape validator.
export const mailSchema = z.object({
  mail: z.object({
    enabled: coerceBoolean,
    host: z.string().trim().min(1).max(253),
    apiKey: z.string().trim().max(512).optional(),
    sender: z.union([z.literal(''), z.email()]),
  }),
})
export type MailInput = z.infer<typeof mailSchema>

import type { SettingsBundle, SecretMasks } from '@kobato/settings/types.ts'

import { type SettingsSection, SETTINGS_SECTIONS } from '@kobato/settings/sections.ts'
import { z } from 'zod'

// `admin.settings` wire: the settings workspace bootstrap/update procedures.
// The settings MODEL lives in `@kobato/settings`; this module owns only the
// admin RPC envelope around it.

// Settings layout loader data: the redacted (secrets stripped) backfilled
// bundle, the IANA timezone list, and the secret masks. `SERVICE_UNAVAILABLE`
// (503) carries the uninstalled / truncated-sections semantics the layout
// route currently throws.
export const adminSettingsBootstrapOutputSchema = z.object({
  bundle: z.custom<SettingsBundle>(),
  timeZones: z.custom<readonly string[]>(),
  masks: z.custom<SecretMasks>(),
})
export type AdminSettingsBootstrapOutput = z.infer<typeof adminSettingsBootstrapOutputSchema>

// `admin.settings.update` — a strict-keyed section patch. The section enum
// covers every registry section; the payload is validated server-side against
// the section's write schema (unknown keys reject with `unrecognizedKeys`).
export const adminSettingsUpdateInput = z.object({
  section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
  payload: z.record(z.string(), z.unknown()),
})
export type AdminSettingsUpdateInput = z.infer<typeof adminSettingsUpdateInput>

// The response is authoritative: the merged, validated section in the admin
// display shape. The client adopts it for DISPLAY — a save must never refetch
// the document out from under the user's hands — while its form baseline
// advances to the submitted values (patches are sparse, so the response also
// carries fields this card never sent). The REAL runtime gate lives in the
// server's `projectSectionForAdmin`.
export const adminSettingsUpdateOutput = z.object({ section: z.unknown(), warnings: z.array(z.string()) })
export type AdminSettingsUpdateOutput = z.infer<typeof adminSettingsUpdateOutput>

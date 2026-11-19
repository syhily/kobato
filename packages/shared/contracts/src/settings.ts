import type { SettingsBundle, SecretMasks } from '@kobato/settings/types.ts'

import { type SettingsSection, SETTINGS_SECTIONS } from '@kobato/settings/sections.ts'
import { z } from 'zod'

export const adminSettingsBootstrapOutputSchema = z.object({
  bundle: z.custom<SettingsBundle>(),
  timeZones: z.custom<readonly string[]>(),
  masks: z.custom<SecretMasks>(),
})
export type AdminSettingsBootstrapOutput = z.infer<typeof adminSettingsBootstrapOutputSchema>

export const adminSettingsUpdateInput = z.object({
  section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
  payload: z.record(z.string(), z.unknown()),
})
export type AdminSettingsUpdateInput = z.infer<typeof adminSettingsUpdateInput>

export const adminSettingsUpdateOutput = z.object({ section: z.unknown(), warnings: z.array(z.string()) })
export type AdminSettingsUpdateOutput = z.infer<typeof adminSettingsUpdateOutput>

import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'

import { SETTINGS_SECTIONS } from '@/shared/config/sections'

export const updateSettingsSchema = z.object({
  section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
  payload: z.unknown(),
})

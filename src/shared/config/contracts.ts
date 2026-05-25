import type { SettingsSection } from '@/shared/config/sections'

export interface UpdateSettingsInput {
  section: SettingsSection
  payload: unknown
}

export interface UpdateSettingsOutput {
  success: true
}

export interface SendTestMailInput {
  to: string
}

export interface SendTestMailOutput {
  success: true
}

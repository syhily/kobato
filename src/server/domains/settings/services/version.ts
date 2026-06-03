import { storage } from '@/server/infra/redis/storage'

const SETTINGS_VERSION_KEY = 'settings:snapshot:version'
let localSettingsVersion = 0

export async function bumpSettingsVersion(): Promise<void> {
  const now = Date.now()
  await storage.setItem(SETTINGS_VERSION_KEY, now, { ttl: 60 * 60 * 24 * 7 })
}

export async function getSettingsVersion(): Promise<number> {
  const value = await storage.getItem<number>(SETTINGS_VERSION_KEY)
  return value ?? 0
}

/** Reset the in-process version counter (test helper). */
export function resetLocalSettingsVersion(): void {
  localSettingsVersion = 0
}

/** Expose local version for hydration logic. */
export function readLocalSettingsVersion(): number {
  return localSettingsVersion
}

/** Advance local version to a known value. */
export function setLocalSettingsVersion(v: number): void {
  localSettingsVersion = v
}

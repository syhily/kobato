export interface SettingsChangeVerdict {
  readonly commit: false
}

export const SETTINGS_SKIP_COMMIT: SettingsChangeVerdict = { commit: false }

export function isSettingsSkipCommit(value: unknown): value is SettingsChangeVerdict {
  return value === SETTINGS_SKIP_COMMIT
}

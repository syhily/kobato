/**
 * Explicit opt-out a discrete-control guard returns to suppress the wrapper's
 * `save(name)` — the change was vetoed, or the guard committed the field itself.
 * A plain boolean cannot carry this: RHF's async `field.onChange` may resolve to
 * `false` (its `state.next`), which would look like a veto.
 */
export interface SettingsChangeVerdict {
  readonly commit: false
}

export const SETTINGS_SKIP_COMMIT: SettingsChangeVerdict = { commit: false }

export function isSettingsSkipCommit(value: unknown): value is SettingsChangeVerdict {
  return value === SETTINGS_SKIP_COMMIT
}

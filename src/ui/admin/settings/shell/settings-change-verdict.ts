/**
 * Explicit opt-out a discrete-control guard returns to suppress the wrapper's
 * `save(name)` — either because the change was vetoed, or because the guard
 * committed the field itself.
 *
 * A plain boolean cannot carry this contract: RHF's `field.onChange` is async
 * and may itself resolve to `false` (its internal `state.next` result), so an
 * existing `onValueChange={field.onChange}` call site would look like a veto.
 * Guards therefore return this sentinel object; any other return value (or
 * none) lets the wrapper commit.
 */
export interface SettingsChangeVerdict {
  readonly commit: false
}

export const SETTINGS_SKIP_COMMIT: SettingsChangeVerdict = { commit: false }

export function isSettingsSkipCommit(value: unknown): value is SettingsChangeVerdict {
  return value === SETTINGS_SKIP_COMMIT
}

// Node ≥ 25 ships an experimental `localStorage` global: without
// `--localstorage-file`, reading it emits an ExperimentalWarning. lib0 (in
// the inkling composer's module graph) probes `typeof localStorage` at
// module load, so every node-env worker that SSRs the composer prints the
// warning. Drop exactly this warning; all other warnings still reach stderr.
export function silenceLocalStorageWarning(): void {
  const state = globalThis as typeof globalThis & { __localStorageWarningSilenced?: boolean }
  if (state.__localStorageWarningSilenced) {
    return
  }
  state.__localStorageWarningSilenced = true
  const emit = process.emit.bind(process) as (event: string | symbol, ...args: unknown[]) => boolean
  process.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event === 'warning' && args[0] instanceof Error && args[0].message.includes('--localstorage-file')) {
      return false
    }
    return emit(event, ...args)
  }) as typeof process.emit
}

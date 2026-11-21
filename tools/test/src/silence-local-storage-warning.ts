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

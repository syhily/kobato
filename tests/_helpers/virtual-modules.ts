import type { Plugin } from 'vite'

/** Stubs `virtual:route-warmup-script` for the test bundler (vitest
 *  configs don't load `routeWarmupPlugin`). Empty string matches dev. */
export function routeWarmupScriptStubPlugin(): Plugin {
  const specifier = 'virtual:route-warmup-script'
  const resolved = `\0${specifier}`
  return {
    name: 'route-warmup-script-stub',
    resolveId(id) {
      if (id === specifier) {
        return resolved
      }
    },
    load(id) {
      if (id === resolved) {
        return 'export default ""'
      }
    },
  }
}

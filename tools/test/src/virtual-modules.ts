import type { Plugin } from 'vite'

export function routeWarmupScriptStubPlugin(): Plugin {
  const specifier = 'virtual:kobato-route-warmup'
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

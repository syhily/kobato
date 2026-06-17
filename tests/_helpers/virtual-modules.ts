import type { Plugin } from 'vite'

/**
 * Stubs `virtual:route-warmup-script` for the test bundler.
 *
 * `routeWarmupPlugin` provides this virtual module during the real production
 * build, but the vitest configs don't load that plugin. Route modules that
 * transitively import `root.tsx` → `RouteWarmupScript` would otherwise fail to
 * resolve the specifier. The stub returns an empty string — matching dev
 * behavior, and the component short-circuits on DEV regardless.
 */
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

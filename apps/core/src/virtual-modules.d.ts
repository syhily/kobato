// Ambient declarations for virtual modules provided by Vite plugins.
// Kept in a script-scope file (no top-level import/export) so these create
// true ambient modules rather than augmenting existing ones — env.d.ts is a
// module (it has a top-level `import type`), so the same declaration there
// resolves to nothing (TS2307).

// Provided by `routeWarmupPlugin` (src/server/infra/route-warmup.ts): the
// bundled + minified route-warmup inline script. Empty string in dev.
declare module 'virtual:route-warmup-script' {
  const script: string
  export default script
}

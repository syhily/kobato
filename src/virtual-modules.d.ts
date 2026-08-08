// Ambient declarations for virtual modules provided by Vite plugins — kept
// script-scope (no import/export) so they form true ambient modules; env.d.ts
// is a module, so the same declarations there resolve to nothing (TS2307).

// Provided by `routeWarmupPlugin`; bundled + minified, empty string in dev.
declare module 'virtual:route-warmup-script' {
  const script: string
  export default script
}

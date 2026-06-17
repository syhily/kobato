// Sentinel injected into the bundled route-warmup inline script in place of
// the per-request chunk list. `routeWarmupPlugin` bundles
// `src/client/scripts/route-warmup.entry.ts`, whose minified output contains
// this literal. `RouteWarmupScript` (SSR) then replaces it with
// `JSON.stringify(chunks)` before emitting the inline `<script>`.
//
// Must survive minification as a string literal and stay unique within the
// bundle. If you change it, update every reference (entry, component, plugin
// sanity check) — the build-time `includes()` guard will fail loudly on drift.
export const CHUNKS_SENTINEL = '__ROUTE_WARMUP_CHUNKS__'

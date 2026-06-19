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

// Chunk-name patterns that should never be eagerly preloaded. These correspond
// to heavy lazy-only widgets / native libraries and are kept out of both the
// critical path and the idle secondary-route batches.
export const WARMUP_GLOBAL_EXCLUDED_PATTERNS = [
  '^canvas-', // @napi-rs/canvas native library chunks
  '^ImageEditorCanvas-', // lazy image editor dialog
  '^qrcode', // qrcode.react dynamic chunk
  '^player-', // lazy audio player (aplayer)
]

// Editor-only chunks that are allowed in the editor idle tier but should not
// be pulled into the public/admin/auth critical or idle paths.
export const WARMUP_EDITOR_ONLY_PATTERN = '^editor-inkling-'

// Shared shape of the React Router client manifest that the route-warmup
// plugin writes and the SSR runtime reads back to match request URLs.
export interface RouteManifestEntry {
  module: string
  imports: string[]
}

export interface RouteManifestRoute {
  id: string
  parentId?: string
  path?: string
  index?: boolean
  module: string
  imports: string[]
  clientActionModule?: string
  clientLoaderModule?: string
  clientMiddlewareModule?: string
  hydrateFallbackModule?: string
}

export interface RouteManifest {
  entry: RouteManifestEntry
  routes: Record<string, RouteManifestRoute>
}

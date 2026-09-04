// Sentinel in the bundled route-warmup inline script, replaced with
// `JSON.stringify(chunks)` by `RouteWarmupScript` (SSR). Must survive
// minification as a string literal and stay unique in the bundle; the
// build-time `includes()` guard fails loudly on drift.
export const CHUNKS_SENTINEL = '__ROUTE_WARMUP_CHUNKS__'

// Chunk-name patterns never eagerly preloaded — heavy lazy-only widgets
// / native libraries, kept out of both the critical and idle batches.
export const WARMUP_GLOBAL_EXCLUDED_PATTERNS = [
  '^canvas-', // @napi-rs/canvas native library chunks
  '^ImageEditorCanvas-', // lazy image editor dialog
  '^qrcode', // qrcode.react dynamic chunk
  '^player-', // lazy audio player (aplayer)
]

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

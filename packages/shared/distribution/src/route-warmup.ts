// Sentinel in the bundled route-warmup inline script, replaced with
// `JSON.stringify(chunks)` by `RouteWarmupScript` (SSR). Must survive
// minification as a string literal and stay unique in the bundle; the
// build-time `includes()` guard fails loudly on drift.
export const CHUNKS_SENTINEL = '__ROUTE_WARMUP_CHUNKS__'

export const WARMUP_GLOBAL_EXCLUDED_PATTERNS = ['^canvas-', '^ImageEditorCanvas-', '^qrcode', '^music-player-']

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

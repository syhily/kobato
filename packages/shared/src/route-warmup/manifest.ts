// Single owner of the route-warmup file contract: the warmup-manifest shape
// the build-time plugin writes, the React Router client-manifest parsing the
// SSR reader (and the plugin) rely on, and the chunk walk both sides share.
// Keeping parse / validate / collect here makes drift between the writer
// (`src/server/infra/route-warmup.ts`) and the reader
// (`src/server/render/warmup/manifest.ts`) impossible by construction.
//
// Isomorphic: pure JSON/regex only — no node APIs, no logging.
import type { RouteManifest, RouteManifestRoute } from '@kobato/shared/constants/route-warmup'

// Local copy of `isRecord` (same semantics as `@/shared/utils/type-guards`)
// — do NOT import it. The vite plugin pulls this module into the
// vite.config.ts graph, where `@/` aliases are not resolved, so runtime
// imports must stay zero (type-only imports are erased and safe).
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface WarmupManifest {
  version: number
  tier1: string[]
  tier2_public: string[]
  tier2_admin: string[]
  tier2_editor: string[]
  tier2_auth: string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isWarmupManifest(value: unknown): value is WarmupManifest {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.version === 'number' &&
    isStringArray(value.tier1) &&
    isStringArray(value.tier2_public) &&
    isStringArray(value.tier2_admin) &&
    isStringArray(value.tier2_editor) &&
    isStringArray(value.tier2_auth)
  )
}

function isRouteManifestRoute(value: unknown): value is RouteManifestRoute {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.module === 'string' &&
    isStringArray(value.imports) &&
    (value.parentId === undefined || typeof value.parentId === 'string') &&
    (value.path === undefined || typeof value.path === 'string') &&
    (value.index === undefined || typeof value.index === 'boolean') &&
    (value.clientActionModule === undefined || typeof value.clientActionModule === 'string') &&
    (value.clientLoaderModule === undefined || typeof value.clientLoaderModule === 'string') &&
    (value.clientMiddlewareModule === undefined || typeof value.clientMiddlewareModule === 'string') &&
    (value.hydrateFallbackModule === undefined || typeof value.hydrateFallbackModule === 'string')
  )
}

export function isRouteManifest(value: unknown): value is RouteManifest {
  if (!isRecord(value)) {
    return false
  }
  const entry = value.entry
  if (!isRecord(entry) || typeof entry.module !== 'string' || !isStringArray(entry.imports)) {
    return false
  }
  const routes = value.routes
  if (!isRecord(routes)) {
    return false
  }
  for (const route of Object.values(routes)) {
    if (!isRouteManifestRoute(route)) {
      return false
    }
  }
  return true
}

// Parses the `window.__reactRouterManifest=...;` payload the client build
// writes. Never throws, never logs — a wrong prefix, malformed JSON, or a
// shape mismatch all return null and the caller decides how to report it.
export function parseClientManifest(content: string): RouteManifest | null {
  const prefix = 'window.__reactRouterManifest='
  if (!content.startsWith(prefix)) {
    return null
  }
  try {
    const jsonText = content.slice(prefix.length).replace(/;\s*$/, '')
    const parsed: unknown = JSON.parse(jsonText)
    if (!isRouteManifest(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// Chunk ids are `/assets/*.js` paths; exclusion patterns match against the
// basename only. Computed without `node:path` so this module stays
// isomorphic.
function matchesAny(chunk: string, patterns: RegExp[]): boolean {
  const name = chunk.split('/').pop() ?? chunk
  return patterns.some((p) => p.test(name))
}

/**
 * Collects the chunks for the given manifest ids, deduped in insertion
 * order. `'entry'` resolves to `manifest.entry` (module + imports — the
 * entry has no `client*` extras); every other id, INCLUDING `'root'`,
 * resolves through `manifest.routes[id]` with module + imports + the four
 * `client*Module` / `hydrateFallbackModule` extras. Unknown ids are skipped.
 */
export function collectManifestChunks(
  manifest: RouteManifest,
  ids: string[],
  excludePatterns: RegExp[] = [],
): string[] {
  const chunks = new Set<string>()
  const add = (chunk: string) => {
    if (!matchesAny(chunk, excludePatterns)) {
      chunks.add(chunk)
    }
  }
  for (const id of ids) {
    if (id === 'entry') {
      const entry = manifest.entry
      if (entry) {
        add(entry.module)
        for (const imp of entry.imports) {
          add(imp)
        }
      }
      continue
    }
    const route = manifest.routes[id]
    if (!route) {
      continue
    }
    add(route.module)
    for (const imp of route.imports) {
      add(imp)
    }
    for (const extra of [
      route.clientActionModule,
      route.clientLoaderModule,
      route.clientMiddlewareModule,
      route.hydrateFallbackModule,
    ]) {
      if (extra) {
        add(extra)
      }
    }
  }
  return [...chunks]
}

// Single owner of the route-warmup file contract: the manifest shape the
// build-time plugin writes and the chunk walk both sides share, so the
// writer and reader can't drift. Isomorphic: pure JSON/regex only.
import type { RouteManifest, RouteManifestRoute } from '@/shared/constants/route-warmup'

// Local copy of `isRecord` — do NOT import it: the vite plugin pulls
// this module into the vite.config.ts graph, where `@/` aliases are
// unresolved, so runtime imports must stay zero.
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

// Parses the `window.__reactRouterManifest=...;` payload; never throws —
// a wrong prefix, malformed JSON, or a shape mismatch all return null.
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

// Chunk ids are `/assets/*.js` paths; exclusion patterns match the
// basename only (no `node:path`).
function matchesAny(chunk: string, patterns: RegExp[]): boolean {
  const name = chunk.split('/').pop() ?? chunk
  return patterns.some((p) => p.test(name))
}

/** Chunks for the given manifest ids, deduped in insertion order. `'entry'` → `manifest.entry`; every other id INCLUDING `'root'` → `manifest.routes[id]` (module + imports + the `client*Module` / `hydrateFallbackModule` extras); unknown ids skipped. */
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

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchRoutes, type RouteObject } from 'react-router'

import {
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
  type RouteManifestRoute,
} from '@/shared/constants/route-warmup'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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

function isWarmupManifest(value: unknown): value is WarmupManifest {
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

let cached: WarmupManifest | null | undefined

export function getWarmupManifest(): WarmupManifest | null {
  if (cached !== undefined) {
    return cached
  }
  if (import.meta.env.DEV) {
    cached = null
    return null
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const manifestPath = join(__dirname, '..', '..', 'client', 'assets', 'warmup-manifest.json')

    if (!existsSync(manifestPath)) {
      cached = null
      return null
    }

    const raw = readFileSync(manifestPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!isWarmupManifest(parsed)) {
      cached = null
      return null
    }
    cached = parsed
    return cached
  } catch {
    cached = null
    return null
  }
}

// --- Route manifest reader (request-time critical-path preloads) ---

let routeManifestCache: RouteManifest | null | undefined
let routeTreeCache: RouteObject[] | undefined

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

function isRouteManifest(value: unknown): value is RouteManifest {
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

function parseClientManifest(content: string): RouteManifest | null {
  const prefix = 'window.__reactRouterManifest='
  if (!content.startsWith(prefix)) {
    return null
  }
  const jsonText = content.slice(prefix.length).replace(/;\s*$/, '')
  const parsed: unknown = JSON.parse(jsonText)
  if (!isRouteManifest(parsed)) {
    return null
  }
  return parsed
}

function readClientManifest(): RouteManifest | null {
  if (import.meta.env.DEV) {
    return null
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const assetsDir = join(__dirname, '..', '..', 'client', 'assets')

    if (!existsSync(assetsDir)) {
      return null
    }

    const files = readdirSync(assetsDir)
    const manifestFile = files.find((f) => f.startsWith('manifest-') && f.endsWith('.js'))
    if (!manifestFile) {
      return null
    }

    const content = readFileSync(join(assetsDir, manifestFile), 'utf-8')
    return parseClientManifest(content)
  } catch {
    return null
  }
}

export function getRouteManifest(): RouteManifest | null {
  if (routeManifestCache !== undefined) {
    return routeManifestCache
  }
  routeManifestCache = readClientManifest()
  return routeManifestCache
}

function buildRouteTree(manifest: RouteManifest): RouteObject[] {
  const childrenByParent = new Map<string, RouteManifestRoute[]>()
  for (const route of Object.values(manifest.routes)) {
    const parentId = route.parentId ?? ''
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(route)
    } else {
      childrenByParent.set(parentId, [route])
    }
  }

  function build(id: string): RouteObject {
    const route = manifest.routes[id]
    const children = (childrenByParent.get(id) ?? []).map((r) => build(r.id))
    // The React Router `RouteObject` union types `index` as a discriminant,
    // so constructing it with optional fields requires an assertion.
    return unsafeCast<RouteObject>({
      id,
      path: route?.path,
      index: route?.index,
      children: children.length > 0 ? children : undefined,
    })
  }

  return [build('root')]
}

function matchesAny(chunk: string, patterns: RegExp[]): boolean {
  const name = basename(chunk)
  return patterns.some((p) => p.test(name))
}

function collectRouteChunks(manifest: RouteManifest, ids: string[], excludePatterns: RegExp[]): string[] {
  const chunks = new Set<string>()
  for (const id of ids) {
    if (id === 'entry') {
      const entry = manifest.entry
      if (entry) {
        if (!matchesAny(entry.module, excludePatterns)) {
          chunks.add(entry.module)
        }
        for (const imp of entry.imports) {
          if (!matchesAny(imp, excludePatterns)) {
            chunks.add(imp)
          }
        }
      }
      continue
    }

    const route = manifest.routes[id]
    if (!route) {
      continue
    }

    if (!matchesAny(route.module, excludePatterns)) {
      chunks.add(route.module)
    }
    for (const imp of route.imports) {
      if (!matchesAny(imp, excludePatterns)) {
        chunks.add(imp)
      }
    }
    for (const extra of [
      route.clientActionModule,
      route.clientLoaderModule,
      route.clientMiddlewareModule,
      route.hydrateFallbackModule,
    ]) {
      if (extra && !matchesAny(extra, excludePatterns)) {
        chunks.add(extra)
      }
    }
  }
  return [...chunks]
}

/**
 * Returns the critical-path modulepreload chunks for a given pathname by
 * matching it against the React Router client manifest. Includes the entry
 * bundle, the matched route, and all ancestor layouts. Returns `null` in dev
 * or when the manifest is missing, so callers can fall back to the home-tier
 * list from `getWarmupManifest()`.
 */
export function getCriticalChunksForPathname(pathname: string): string[] | null {
  const manifest = getRouteManifest()
  if (!manifest) {
    return null
  }

  if (!routeTreeCache) {
    routeTreeCache = buildRouteTree(manifest)
  }

  const matches = matchRoutes(routeTreeCache, pathname)
  if (!matches || matches.length === 0) {
    return null
  }

  const ids = matches.map((m) => m.route.id).filter((id): id is string => typeof id === 'string')
  const excludePatterns = WARMUP_GLOBAL_EXCLUDED_PATTERNS.map((p) => new RegExp(p))
  return collectRouteChunks(manifest, ['entry', ...ids], excludePatterns)
}

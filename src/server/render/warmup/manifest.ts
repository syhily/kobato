import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchRoutes, type RouteObject } from 'react-router'

import { getEmbeddedAsset, isSea, listEmbeddedAssetKeys } from '@/server/infra/sea'
import {
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
  type RouteManifestRoute,
} from '@/shared/constants/route-warmup'
import {
  collectManifestChunks,
  isWarmupManifest,
  parseClientManifest,
  type WarmupManifest,
} from '@/shared/route-warmup/manifest'
import { SEA_CLIENT_ASSET_PREFIX } from '@/shared/sea/assets'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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
    if (isSea()) {
      // Single-executable build: the warmup manifest is embedded in the
      // binary (`client/assets/warmup-manifest.json`), not on disk.
      const asset = getEmbeddedAsset(`${SEA_CLIENT_ASSET_PREFIX}assets/warmup-manifest.json`)
      if (asset === null) {
        cached = null
        return null
      }
      const parsed: unknown = JSON.parse(asset.toString('utf-8'))
      if (!isWarmupManifest(parsed)) {
        cached = null
        return null
      }
      cached = parsed
      return cached
    }

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

function readClientManifest(): RouteManifest | null {
  if (import.meta.env.DEV) {
    return null
  }

  try {
    if (isSea()) {
      // Single-executable build: enumerate the embedded assets instead of
      // reading `build/client/assets` from disk.
      const manifestKey = listEmbeddedAssetKeys(`${SEA_CLIENT_ASSET_PREFIX}assets/manifest-`).find((key) =>
        key.endsWith('.js'),
      )
      if (!manifestKey) {
        return null
      }
      const content = getEmbeddedAsset(manifestKey)?.toString('utf-8')
      if (!content) {
        return null
      }
      return parseClientManifest(content)
    }

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
  return collectManifestChunks(manifest, ['entry', ...ids], excludePatterns)
}

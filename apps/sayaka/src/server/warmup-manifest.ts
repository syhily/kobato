import {
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
  type RouteManifestRoute,
} from '@kobato/distribution/route-warmup'
import { SEA_SAYAKA_CLIENT_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import {
  collectManifestChunks,
  isWarmupManifest,
  parseClientManifest,
  type WarmupManifest,
} from '@kobato/distribution/warmup-manifest'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { seaVfsRoot } from '@sayaka/server/sea'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchRoutes, type RouteObject } from 'react-router'

let cached: WarmupManifest | null | undefined

let testAssetsDir: string | null = null

export function __setWarmupAssetsDirForTests(dir: string | null): void {
  testAssetsDir = dir
  cached = undefined
  routeManifestCache = undefined
  routeTreeCache = undefined
}

function assetsRoot(): string {
  const diskRoot = testAssetsDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'assets')
  const root = seaVfsRoot()
  return root === null ? diskRoot : join(root, SEA_SAYAKA_CLIENT_ASSET_PREFIX, 'assets')
}

export function getWarmupManifest(): WarmupManifest | null {
  if (cached !== undefined) {
    return cached
  }
  if (import.meta.env.DEV) {
    cached = null
    return null
  }

  try {
    const file = join(assetsRoot(), 'warmup-manifest.json')
    if (!existsSync(file)) {
      cached = null
      return null
    }
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
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

let routeManifestCache: RouteManifest | null | undefined
let routeTreeCache: RouteObject[] | undefined

function readClientManifest(): RouteManifest | null {
  if (import.meta.env.DEV) {
    return null
  }

  try {
    const dir = assetsRoot()
    if (!existsSync(dir)) {
      return null
    }
    const manifestFile = readdirSync(dir).find((f) => f.startsWith('manifest-') && f.endsWith('.js'))
    if (!manifestFile) {
      return null
    }
    return parseClientManifest(readFileSync(join(dir, manifestFile), 'utf8'))
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
    return unsafeCast<RouteObject>({
      id,
      path: route?.path,
      index: route?.index,
      children: children.length > 0 ? children : undefined,
    })
  }

  return [build('root')]
}

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

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchRoutes, type RouteObject } from 'react-router'

import { isSea, listEmbeddedAssetKeys } from '@/server/infra/sea'
import { readAssetTextOrDisk } from '@/server/infra/sea-asset'
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
    const __dirname = dirname(fileURLToPath(import.meta.url))
    // SEA: the manifest is embedded, not on disk.
    const raw = readAssetTextOrDisk(
      `${SEA_CLIENT_ASSET_PREFIX}assets/warmup-manifest.json`,
      join(__dirname, '..', '..', 'client', 'assets', 'warmup-manifest.json'),
    )
    if (raw === null) {
      cached = null
      return null
    }

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

let routeManifestCache: RouteManifest | null | undefined
let routeTreeCache: RouteObject[] | undefined

function readClientManifest(): RouteManifest | null {
  if (import.meta.env.DEV) {
    return null
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const assetsDir = join(__dirname, '..', '..', 'client', 'assets')

    // Hashed manifest bundle: embedded keys under SEA, dir listing on disk.
    let manifestFile: string | undefined
    if (isSea()) {
      const key = listEmbeddedAssetKeys(`${SEA_CLIENT_ASSET_PREFIX}assets/manifest-`).find((k) => k.endsWith('.js'))
      manifestFile = key?.slice(`${SEA_CLIENT_ASSET_PREFIX}assets/`.length)
    } else if (existsSync(assetsDir)) {
      manifestFile = readdirSync(assetsDir).find((f) => f.startsWith('manifest-') && f.endsWith('.js'))
    }
    if (!manifestFile) {
      return null
    }

    const content = readAssetTextOrDisk(
      `${SEA_CLIENT_ASSET_PREFIX}assets/${manifestFile}`,
      join(assetsDir, manifestFile),
    )
    if (content === null) {
      return null
    }
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
    // `index` is a discriminant in the RouteObject union — assertion required.
    return unsafeCast<RouteObject>({
      id,
      path: route?.path,
      index: route?.index,
      children: children.length > 0 ? children : undefined,
    })
  }

  return [build('root')]
}

/** modulepreload chunks for a pathname: entry + matched route + ancestor layouts. Null in dev / missing manifest. */
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

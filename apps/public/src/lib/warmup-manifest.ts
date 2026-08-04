// Route-warmup manifest reader — the frontend's local copy of
// `@/server/render/warmup/manifest.ts`, minus the server-only machinery.
//
// The public app owns its own client build (`apps/public/build/client`),
// so the warmup manifest + React Router client manifest it reads are its
// own — embedded under SEA (keys `client/assets/...`), on disk otherwise.
// The parse/validate/collect helpers and the route-tree builder stay in
// `@kobato/shared/route-warmup` (the single owner of the file contract);
// only the asset read and the chunk matching are local.

import { WARMUP_GLOBAL_EXCLUDED_PATTERNS, type RouteManifest } from '@kobato/shared/constants/route-warmup'
import {
  collectManifestChunks,
  isWarmupManifest,
  parseClientManifest,
  type WarmupManifest,
} from '@kobato/shared/route-warmup/manifest'
import { buildRouteTree } from '@kobato/shared/route-warmup/tree'
import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/shared/sea/assets'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchRoutes, type RouteObject } from 'react-router'

import { listEmbeddedAssetKeys, readAssetTextOrDisk } from './sea-assets'

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
    // Single-executable build: the warmup manifest is embedded in the
    // binary (`client/assets/warmup-manifest.json`), not on disk. The disk
    // fallback is the sibling of the server bundle's directory: the build
    // root is `apps/public/build` with `server/` and `client/` subdirs.
    const raw = readAssetTextOrDisk(
      `${SEA_CLIENT_ASSET_PREFIX}assets/warmup-manifest.json`,
      join(__dirname, '..', 'client', 'assets', 'warmup-manifest.json'),
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

// --- Route manifest reader (request-time critical-path preloads) ---

let routeManifestCache: RouteManifest | null | undefined
let routeTreeCache: RouteObject[] | undefined

function readClientManifest(): RouteManifest | null {
  if (import.meta.env.DEV) {
    return null
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const assetsDir = join(__dirname, '..', 'client', 'assets')

    // Discover the hashed manifest bundle: embedded asset keys under SEA,
    // the `build/client/assets` directory listing on disk.
    let manifestFile: string | undefined
    const sea = listEmbeddedAssetKeys(`${SEA_CLIENT_ASSET_PREFIX}assets/manifest-`)
    if (sea.length > 0) {
      manifestFile = sea.find((k) => k.endsWith('.js'))?.slice(`${SEA_CLIENT_ASSET_PREFIX}assets/`.length)
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

/** Tier-2 idle preload buckets (the public app has only the public bucket). */
export function collectTier2Chunks(
  manifest: {
    tier2_public: string[]
    tier2_admin: string[]
    tier2_editor: string[]
    tier2_auth: string[]
  },
  isAdmin: boolean,
  criticalSet: Set<string>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (arr: string[]) => {
    for (const c of arr) {
      if (!seen.has(c) && !criticalSet.has(c)) {
        seen.add(c)
        result.push(c)
      }
    }
  }
  push(manifest.tier2_public)
  if (isAdmin) {
    push(manifest.tier2_admin)
    push(manifest.tier2_editor)
  }
  push(manifest.tier2_auth)
  return result
}

import type { Plugin } from 'vite'

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Route tier configuration
// ---------------------------------------------------------------------------

const TIER1_ROUTES = ['root', 'routes/public/layout', 'routes/public/home', 'home-page', 'routes/public/post/detail']

const TIER2_PUBLIC_ROUTES = [
  'routes/public/archives',
  'routes/public/categories',
  'routes/public/category/list',
  'category-list-page',
  'routes/public/tag/list',
  'tag-list-page',
  'routes/public/search/list',
  'search-list-page',
  'routes/public/page/detail',
  'routes/public/not-found',
]

const TIER2_ADMIN_ROUTES = [
  'routes/admin/layout',
  'routes/admin/dashboard',
  'routes/admin/posts/index',
  'routes/admin/posts/analytics',
  'routes/admin/pages/index',
  'routes/admin/comments',
  'routes/admin/categories',
  'routes/admin/tags',
  'routes/admin/friends',
  'routes/admin/library/images',
  'routes/admin/library/music',
  'routes/admin/users/index',
  'routes/admin/users/detail',
  'routes/admin/me/profile',
  'routes/admin/me/comments',
  'routes/admin/me/sessions',
  'routes/admin/security/sessions',
  'routes/admin/security/audit-log',
  'routes/admin/analytics/layout',
  'routes/admin/analytics/overview',
  'routes/admin/analytics/realtime',
  'routes/admin/analytics/mentions',
  'routes/admin/settings/layout',
  'routes/admin/settings/index',
]

const TIER2_EDITOR_ROUTES = [
  'routes/editor/layout',
  'routes/editor/post/new',
  'routes/editor/post/edit',
  'routes/editor/post/analytics',
  'routes/editor/page/new',
  'routes/editor/page/edit',
]

const TIER2_AUTH_ROUTES = ['routes/auth/layout', 'routes/auth/signin', 'routes/auth/setup/index']

// Chunks excluded from all tiers except where explicitly allowed
const EXCLUDED_PATTERNS = [/^canvas-/]
// Excluded from tier 1, public, admin, auth — kept in editor tier
const EDITOR_ONLY_PATTERN = /^editor-tiptap-/

const IDLE_SIZE_LIMIT = 100 * 1024 // 100 KB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteManifest {
  entry: { module: string; imports: string[] }
  routes: Record<
    string,
    {
      module: string
      imports: string[]
      clientActionModule?: string
      clientLoaderModule?: string
      clientMiddlewareModule?: string
      hydrateFallbackModule?: string
    }
  >
}

interface WarmupManifest {
  version: number
  tier1: string[]
  tier2_public: string[]
  tier2_admin: string[]
  tier2_editor: string[]
  tier2_auth: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectChunks(manifest: RouteManifest, routeIds: string[]): string[] {
  const chunks = new Set<string>()
  for (const id of routeIds) {
    if (id === 'root' || id === 'entry') {
      const entry = id === 'entry' ? manifest.entry : manifest.routes['root']
      if (entry) {
        chunks.add(entry.module)
        for (const imp of entry.imports) {
          chunks.add(imp)
        }
      }
      continue
    }
    const route = manifest.routes[id]
    if (!route) {
      continue
    }
    chunks.add(route.module)
    for (const imp of route.imports) {
      chunks.add(imp)
    }
    for (const extra of [
      route.clientActionModule,
      route.clientLoaderModule,
      route.clientMiddlewareModule,
      route.hydrateFallbackModule,
    ]) {
      if (extra) {
        chunks.add(extra)
      }
    }
  }
  return [...chunks]
}

function matchesAny(chunk: string, patterns: RegExp[]): boolean {
  const name = basename(chunk)
  return patterns.some((p) => p.test(name))
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function routeWarmupPlugin(): Plugin {
  return {
    name: 'route-warmup',
    enforce: 'post',

    writeBundle: {
      order: 'post',
      async handler(options, _bundle) {
        // With v8_viteEnvironmentApi, the client build fires first,
        // then the SSR build. Run in the SSR environment so both
        // client assets and the server manifest are available.
        const env = (this as any).environment

        // Skip client env (server manifest not written yet)
        if (env && env.name === 'client') {
          return
        }
        // If no environment API (older Vite), skip SSR builds
        if (!env && (options as any).ssr) {
          return
        }

        // The server build's outDir is build/server
        // Client assets are at build/client/assets
        const serverOutDir = options.dir
        if (!serverOutDir) {
          return
        }

        const clientAssetsDir = resolve(serverOutDir, '..', 'client', 'assets')
        if (!existsSync(clientAssetsDir)) {
          return
        }

        // Locate server manifest
        const serverBuildPath = join(serverOutDir, 'assets', 'server-build.js')
        if (!existsSync(serverBuildPath)) {
          return
        }

        // Parse manifest from server build
        const manifest = parseServerManifest(serverBuildPath)
        if (!manifest) {
          return
        }

        // Build chunk size map
        const chunkSizes = new Map<string, number>()
        for (const file of readdirSync(clientAssetsDir)) {
          if (!file.endsWith('.js')) {
            continue
          }
          const stat = statSync(join(clientAssetsDir, file))
          chunkSizes.set(`/assets/${file}`, stat.size)
        }

        // Collect per-tier chunks
        const t1Raw = collectChunks(manifest, TIER1_ROUTES)
        const t2PubRaw = collectChunks(manifest, TIER2_PUBLIC_ROUTES)
        const t2AdminRaw = collectChunks(manifest, TIER2_ADMIN_ROUTES)
        const t2EditorRaw = collectChunks(manifest, TIER2_EDITOR_ROUTES)
        const t2AuthRaw = collectChunks(manifest, TIER2_AUTH_ROUTES)

        // Also add entry imports to tier 1
        for (const imp of manifest.entry.imports) {
          t1Raw.push(imp)
        }

        // Deduplicate
        const tier1Set = new Set(t1Raw)

        // Apply filters
        const filterTier = (
          chunks: string[],
          allowEditor: boolean,
          isIdle: boolean,
          excludeAlreadyIn: Set<string>,
        ): string[] => {
          const result: string[] = []
          for (const c of chunks) {
            if (excludeAlreadyIn.has(c)) {
              continue
            }
            if (matchesAny(c, EXCLUDED_PATTERNS)) {
              continue
            }
            if (!allowEditor && matchesAny(c, [EDITOR_ONLY_PATTERN])) {
              continue
            }
            if (isIdle) {
              const size = chunkSizes.get(c) ?? 0
              if (size > IDLE_SIZE_LIMIT) {
                continue
              }
            }
            result.push(c)
          }
          return [...new Set(result)]
        }

        const tier1 = filterTier([...tier1Set], false, false, new Set())
        const tier1FilteredSet = new Set(tier1)

        const tier2_public = filterTier(t2PubRaw, false, true, tier1FilteredSet)
        const tier2_admin = filterTier(t2AdminRaw, false, true, new Set([...tier1FilteredSet, ...tier2_public]))
        const tier2_editor = filterTier(
          t2EditorRaw,
          true,
          true,
          new Set([...tier1FilteredSet, ...tier2_public, ...tier2_admin]),
        )
        const tier2_auth = filterTier(
          t2AuthRaw,
          false,
          true,
          new Set([...tier1FilteredSet, ...tier2_public, ...tier2_admin, ...tier2_editor]),
        )

        const warmupManifest: WarmupManifest = {
          version: 1,
          tier1,
          tier2_public,
          tier2_admin,
          tier2_editor,
          tier2_auth,
        }

        // Write manifest
        const manifestPath = join(clientAssetsDir, 'warmup-manifest.json')
        writeFileSync(manifestPath, JSON.stringify(warmupManifest, null, 2))

        const fmt = (arr: string[]) => {
          const totalKb = arr.reduce((sum, c) => sum + (chunkSizes.get(c) ?? 0), 0) / 1024
          return `${arr.length} chunks (~${totalKb.toFixed(0)} KB)`
        }
        // oxlint-disable-next-line no-console
        console.log(
          `[route-warmup] Manifest written:\n` +
            `  tier1:        ${fmt(tier1)}\n` +
            `  tier2_public: ${fmt(tier2_public)}\n` +
            `  tier2_admin:  ${fmt(tier2_admin)}\n` +
            `  tier2_editor: ${fmt(tier2_editor)}\n` +
            `  tier2_auth:   ${fmt(tier2_auth)}`,
        )
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Manifest parser
// ---------------------------------------------------------------------------

function findMatchingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escape = false
  let stringChar = ''

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === stringChar) {
        inString = false
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      stringChar = char
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

function parseServerManifest(serverBuildPath: string): RouteManifest | null {
  try {
    const src = readFileSync(serverBuildPath, 'utf-8')
    // Extract the server_manifest_default object
    const startMarker = 'var server_manifest_default = '
    const startIdx = src.indexOf(startMarker)
    if (startIdx === -1) {
      return null
    }

    const objectStart = startIdx + startMarker.length
    const endIdx = findMatchingBrace(src, objectStart)
    if (endIdx === -1) {
      return null
    }

    const objectText = src.slice(objectStart, endIdx + 1)
    // Replace `void 0` with `null` for JSON.parse compatibility
    const jsonSafe = objectText.replace(/\bvoid 0\b/g, 'null')
    // Also handle unquoted keys by wrapping them
    const quoted = jsonSafe.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
    return JSON.parse(quoted) as RouteManifest
  } catch {
    return null
  }
}

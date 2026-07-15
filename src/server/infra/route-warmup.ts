/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-type-assertion */
import type { Plugin } from 'vite'

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { build } from 'vite'

import {
  CHUNKS_SENTINEL,
  WARMUP_EDITOR_ONLY_PATTERN,
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
} from '../../shared/constants/route-warmup'

// Route tier configuration

// Critical path for the public launch route (home). The SSR runtime matches
// the current request against the React Router client manifest and emits the
// critical preloads for the matched route instead of always widening the
// first paint with unrelated routes.
const TIER1_ROUTES = ['root', 'routes/public/layout', 'routes/public/home']

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
  'routes/admin/taxonomy/categories',
  'routes/admin/taxonomy/tags',
  'routes/admin/library/images',
  'routes/admin/library/music',
  'routes/admin/library/branding',
  'routes/admin/taxonomy/friends',
  'routes/admin/security/users/index',
  'routes/admin/security/users/detail',
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
const EXCLUDED_PATTERNS = WARMUP_GLOBAL_EXCLUDED_PATTERNS.map((p) => new RegExp(p))
// Excluded from tier 1, public, admin, auth — kept in editor tier
const EDITOR_ONLY_PATTERN = new RegExp(WARMUP_EDITOR_ONLY_PATTERN)

const IDLE_SIZE_LIMIT = 100 * 1024 // 100 KB

// Types

interface WarmupManifest {
  version: number
  tier1: string[]
  tier2_public: string[]
  tier2_admin: string[]
  tier2_editor: string[]
  tier2_auth: string[]
}

// Helpers

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

function loadServerManifest(clientAssetsDir: string): RouteManifest | null {
  try {
    const files = readdirSync(clientAssetsDir)
    const manifestFile = files.find((f) => f.startsWith('manifest-') && f.endsWith('.js'))
    if (!manifestFile) {
      console.error('[route-warmup] React Router client manifest not found in', clientAssetsDir)
      return null
    }

    const content = readFileSync(join(clientAssetsDir, manifestFile), 'utf-8')
    const prefix = 'window.__reactRouterManifest='
    if (!content.startsWith(prefix)) {
      console.error('[route-warmup] React Router client manifest has unexpected format')
      return null
    }

    const jsonText = content.slice(prefix.length).replace(/;\s*$/, '')
    return JSON.parse(jsonText) as RouteManifest
  } catch (err) {
    console.error('[route-warmup] failed to load server manifest', err instanceof Error ? err.message : String(err))
    return null
  }
}

// --- Inline warmup script (bundled + minified at build time) ---------------

const WARMUP_ENTRY = resolve(process.cwd(), 'src/client/scripts/route-warmup.entry.ts')
const VIRTUAL_ID = 'virtual:route-warmup-script'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

// The inline script is static per build, so bundle it once and reuse across
// the client and SSR environments. Cached as a promise so concurrent loads
// dedupe to a single nested build.
let compiledWarmupPromise: Promise<string> | null = null

function bundleWarmupScript(): Promise<string> {
  if (!compiledWarmupPromise) {
    compiledWarmupPromise = (async () => {
      // Isolated build (no project plugins) — same pattern as
      // `processWorkerEntryPlugin`. Output is a single self-contained IIFE.
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: true,
          sourcemap: false,
          target: 'es2020',
          rollupOptions: {
            input: WARMUP_ENTRY,
            output: { format: 'iife' },
          },
        },
        resolve: {
          alias: { '@': resolve(process.cwd(), 'src') },
        },
      })

      const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []))
      for (const chunk of outputs) {
        if (chunk.type === 'chunk' && chunk.fileName.endsWith('.js')) {
          // Guards against minifier surprises and sentinel drift.
          if (!chunk.code.includes(CHUNKS_SENTINEL)) {
            throw new Error(
              '[route-warmup] bundled inline script is missing the chunk sentinel — did the minifier config change?',
            )
          }
          return chunk.code
        }
      }
      throw new Error('[route-warmup] inline script build produced no JS chunk')
    })()
  }
  return compiledWarmupPromise
}

// Plugin

export function routeWarmupPlugin(): Plugin {
  let isServe = false
  return {
    name: 'route-warmup',
    enforce: 'post',

    config(_config, { command }) {
      isServe = command === 'serve'
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID
      }
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) {
        return
      }
      // No warmup <script> in dev — the component short-circuits on DEV too.
      if (isServe) {
        return 'export default ""\n'
      }
      const code = await bundleWarmupScript()
      return `export default ${JSON.stringify(code)}\n`
    },

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

        // Read the structured React Router client manifest from disk.
        // The client build fires before the SSR build, so the manifest is
        // already written by the time this SSR writeBundle hook runs.
        const manifest = loadServerManifest(clientAssetsDir)
        if (!manifest) {
          return
        }

        if (Object.keys(manifest.routes).length === 0) {
          console.error('[route-warmup] parsed manifest has 0 routes — likely a parser regression')
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

// Manifest parser

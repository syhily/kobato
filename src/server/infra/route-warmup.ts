import type { Plugin } from 'vite'

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'

import {
  CHUNKS_SENTINEL,
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
} from '../../shared/constants/route-warmup.ts'
import { collectManifestChunks, parseClientManifest, type WarmupManifest } from '../../shared/route-warmup/manifest.ts'
import { unsafeCast } from '../../shared/utils/unsafe-cast.ts'

// Critical preloads for the public launch route — the only editorial list;
// tier 2 is derived from route-ID prefixes below.
export const TIER1_ROUTES = ['root', 'routes/public/layout', 'routes/public/home']

// Tier-2 buckets derive from route-ID prefixes (see TIER2_PREFIXES);
// un-prefixed paginated aliases are skipped — they share their base route's chunk.
const TIER2_PREFIXES = [
  ['routes/public/', 'public'],
  ['routes/admin/', 'admin'],
  ['routes/editor/', 'editor'],
  ['routes/auth/', 'auth'],
] as const

export type Tier2Bucket = (typeof TIER2_PREFIXES)[number][1]

export function tier2BucketForRouteId(id: string): Tier2Bucket | null {
  for (const [prefix, bucket] of TIER2_PREFIXES) {
    if (id.startsWith(prefix)) {
      return bucket
    }
  }
  return null
}

// TIER1 members are excluded up front so they stay tier-1-only despite their public prefix.
export function deriveTier2RouteIds(manifest: RouteManifest): Record<Tier2Bucket, string[]> {
  const tier1 = new Set<string>(TIER1_ROUTES)
  const buckets: Record<Tier2Bucket, string[]> = { public: [], admin: [], editor: [], auth: [] }
  for (const id of Object.keys(manifest.routes)) {
    if (tier1.has(id)) {
      continue
    }
    const bucket = tier2BucketForRouteId(id)
    if (bucket) {
      buckets[bucket].push(id)
    }
  }
  return buckets
}

// Chunks excluded from all tiers except where explicitly allowed
const EXCLUDED_PATTERNS = WARMUP_GLOBAL_EXCLUDED_PATTERNS.map((p) => new RegExp(p))

const IDLE_SIZE_LIMIT = 100 * 1024

function loadServerManifest(clientAssetsDir: string): RouteManifest | null {
  try {
    const files = readdirSync(clientAssetsDir)
    const manifestFile = files.find((f) => f.startsWith('manifest-') && f.endsWith('.js'))
    if (!manifestFile) {
      console.error('[route-warmup] React Router client manifest not found in', clientAssetsDir)
      return null
    }

    const content = readFileSync(join(clientAssetsDir, manifestFile), 'utf-8')
    const manifest = parseClientManifest(content)
    if (!manifest) {
      console.error('[route-warmup] failed to parse the React Router client manifest')
      return null
    }
    return manifest
  } catch (err) {
    console.error('[route-warmup] failed to load server manifest', err instanceof Error ? err.message : String(err))
    return null
  }
}

const WARMUP_ENTRY = resolve(process.cwd(), 'src/client/scripts/route-warmup.entry.ts')
const VIRTUAL_ID = 'virtual:route-warmup-script'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

// Static per build — bundle once, cached as a promise so concurrent loads dedupe.
let compiledWarmupPromise: Promise<string> | null = null

function bundleWarmupScript(): Promise<string> {
  if (!compiledWarmupPromise) {
    compiledWarmupPromise = (async () => {
      // Isolated build (no project plugins); output is a single self-contained IIFE.
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: true,
          sourcemap: false,
          target: 'es2020',
          rolldownOptions: {
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
        // Client build fires first; run in the SSR environment so both assets and the manifest exist.
        const env = unsafeCast<{ environment?: { name?: string } }>(this).environment

        // Skip client env (server manifest not written yet)
        if (env?.name === 'client') {
          return
        }
        // If no environment API (older Vite), skip SSR builds
        if (!env && unsafeCast<{ ssr?: boolean }>(options).ssr) {
          return
        }

        // Server build outDir; client assets are at ../client/assets.
        const serverOutDir = options.dir
        if (!serverOutDir) {
          return
        }

        const clientAssetsDir = resolve(serverOutDir, '..', 'client', 'assets')
        if (!existsSync(clientAssetsDir)) {
          return
        }

        // Client build fired first, so the manifest is already written here.
        const manifest = loadServerManifest(clientAssetsDir)
        if (!manifest) {
          return
        }

        if (Object.keys(manifest.routes).length === 0) {
          console.error('[route-warmup] parsed manifest has 0 routes — likely a parser regression')
          return
        }

        const chunkSizes = new Map<string, number>()
        for (const file of readdirSync(clientAssetsDir)) {
          if (!file.endsWith('.js')) {
            continue
          }
          const stat = statSync(join(clientAssetsDir, file))
          chunkSizes.set(`/assets/${file}`, stat.size)
        }

        const tier2Ids = deriveTier2RouteIds(manifest)
        const t1Raw = collectManifestChunks(manifest, TIER1_ROUTES)
        const t2PubRaw = collectManifestChunks(manifest, tier2Ids.public)
        const t2AdminRaw = collectManifestChunks(manifest, tier2Ids.admin)
        const t2EditorRaw = collectManifestChunks(manifest, tier2Ids.editor)
        const t2AuthRaw = collectManifestChunks(manifest, tier2Ids.auth)

        for (const imp of manifest.entry.imports) {
          t1Raw.push(imp)
        }

        const tier1Set = new Set(t1Raw)

        // Exclusion patterns match against the chunk basename.
        const filterTier = (chunks: string[], isIdle: boolean, excludeAlreadyIn: Set<string>): string[] => {
          const result: string[] = []
          for (const c of chunks) {
            if (excludeAlreadyIn.has(c)) {
              continue
            }
            const name = c.split('/').pop() ?? c
            if (EXCLUDED_PATTERNS.some((p) => p.test(name))) {
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

        const tier1 = filterTier([...tier1Set], false, new Set())
        const tier1FilteredSet = new Set(tier1)

        const tier2_public = filterTier(t2PubRaw, true, tier1FilteredSet)
        const tier2_admin = filterTier(t2AdminRaw, true, new Set([...tier1FilteredSet, ...tier2_public]))
        const tier2_editor = filterTier(
          t2EditorRaw,
          true,
          new Set([...tier1FilteredSet, ...tier2_public, ...tier2_admin]),
        )
        const tier2_auth = filterTier(
          t2AuthRaw,
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

        const manifestPath = join(clientAssetsDir, 'warmup-manifest.json')
        writeFileSync(manifestPath, JSON.stringify(warmupManifest, null, 2))

        const fmt = (arr: string[]) => {
          const totalKb = arr.reduce((sum, c) => sum + (chunkSizes.get(c) ?? 0), 0) / 1024
          return `${arr.length} chunks (~${totalKb.toFixed(0)} KB)`
        }
        console.warn(
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

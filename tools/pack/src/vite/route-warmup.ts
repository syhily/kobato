import type { Plugin } from 'vite'

import {
  CHUNKS_SENTINEL,
  WARMUP_GLOBAL_EXCLUDED_PATTERNS,
  type RouteManifest,
} from '@kobato/base/distribution/route-warmup'
import {
  collectManifestChunks,
  parseClientManifest,
  type WarmupManifest,
} from '@kobato/base/distribution/warmup-manifest'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'

export const TIER1_ROUTES = ['root', 'routes/layout', 'routes/home']

export const TIER2_PREFIXES = ['routes/']

export const IDLE_SIZE_LIMIT = 100 * 1024

export interface RouteWarmupTiering {
  tier1Routes?: readonly string[]
  tier2Prefixes?: readonly string[]
}

export interface RouteWarmupPluginOptions extends RouteWarmupTiering {
  warmupEntry: string
}

export function deriveTier2RouteIds(manifest: RouteManifest, tiering: RouteWarmupTiering = {}): string[] {
  const tier1 = new Set<string>(tiering.tier1Routes ?? TIER1_ROUTES)
  const prefixes = tiering.tier2Prefixes ?? TIER2_PREFIXES
  return Object.keys(manifest.routes).filter((id) => !tier1.has(id) && prefixes.some((prefix) => id.startsWith(prefix)))
}

const EXCLUDED_PATTERNS = WARMUP_GLOBAL_EXCLUDED_PATTERNS.map((p) => new RegExp(p))

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

function loadChunkSizes(clientAssetsDir: string, manifest: RouteManifest): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const href of collectManifestChunks(manifest, ['entry', ...Object.keys(manifest.routes)])) {
    const file = href.split('/').pop()
    if (file === undefined) {
      continue
    }
    const path = join(clientAssetsDir, file)
    if (existsSync(path)) {
      sizes.set(href, statSync(path).size)
    }
  }
  return sizes
}

const VIRTUAL_ID = 'virtual:kobato-route-warmup'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

export function routeWarmupPlugin(options: RouteWarmupPluginOptions): Plugin {
  const tiering: RouteWarmupTiering = { tier1Routes: options.tier1Routes, tier2Prefixes: options.tier2Prefixes }
  const warmupEntry = options.warmupEntry
  let isServe = false
  let compiledWarmupPromise: Promise<string> | null = null

  function bundleWarmupScript(): Promise<string> {
    if (!compiledWarmupPromise) {
      compiledWarmupPromise = (async () => {
        const result = await build({
          configFile: false,
          logLevel: 'warn',
          resolve: { tsconfigPaths: true },
          build: {
            write: false,
            minify: true,
            sourcemap: false,
            target: 'es2020',
            rolldownOptions: {
              input: warmupEntry,
              output: { format: 'iife' },
            },
          },
        })

        const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []))
        for (const chunk of outputs) {
          if (chunk.type === 'chunk' && chunk.fileName.endsWith('.js')) {
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
      if (isServe) {
        return 'export default ""\n'
      }
      const code = await bundleWarmupScript()
      return `export default ${JSON.stringify(code)}\n`
    },

    writeBundle: {
      order: 'post',
      async handler(options, _bundle) {
        const env = unsafeCast<{ environment?: { name?: string } }>(this).environment

        if (env?.name === 'client') {
          return
        }
        if (!env && unsafeCast<{ ssr?: boolean }>(options).ssr) {
          return
        }

        const serverOutDir = options.dir
        if (!serverOutDir) {
          return
        }

        const clientAssetsDir = resolve(serverOutDir, '..', 'client', 'assets')
        if (!existsSync(clientAssetsDir)) {
          return
        }

        const manifest = loadServerManifest(clientAssetsDir)
        if (!manifest) {
          return
        }

        if (Object.keys(manifest.routes).length === 0) {
          console.error('[route-warmup] parsed manifest has 0 routes — likely a parser regression')
          return
        }

        const chunkSizes = loadChunkSizes(clientAssetsDir, manifest)

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
            if (isIdle && (chunkSizes.get(c) ?? 0) > IDLE_SIZE_LIMIT) {
              continue
            }
            result.push(c)
          }
          return [...new Set(result)]
        }

        const t1Raw = collectManifestChunks(manifest, [...(tiering.tier1Routes ?? TIER1_ROUTES)])
        for (const imp of manifest.entry.imports) {
          t1Raw.push(imp)
        }

        const tier1 = filterTier(t1Raw, false, new Set())
        const tier2 = filterTier(
          collectManifestChunks(manifest, deriveTier2RouteIds(manifest, tiering)),
          true,
          new Set(tier1),
        )

        const warmupManifest: WarmupManifest = {
          version: 1,
          tier1,
          tier2,
        }

        const manifestPath = join(clientAssetsDir, 'warmup-manifest.json')
        writeFileSync(manifestPath, JSON.stringify(warmupManifest, null, 2))

        const fmt = (arr: string[]) => {
          const totalKb = arr.reduce((sum, c) => sum + (chunkSizes.get(c) ?? 0), 0) / 1024
          return `${arr.length} chunks (~${totalKb.toFixed(0)} KB)`
        }
        console.warn(`[route-warmup] Manifest written:\n  tier1: ${fmt(tier1)}\n  tier2: ${fmt(tier2)}`)
      },
    },
  }
}

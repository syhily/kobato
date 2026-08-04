import type { Plugin } from 'vite'

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

/**
 * Vite plugin: build `process-worker.ts` as a standalone Node worker file.
 *
 * The main Vite build (SSR/Node target) does not emit standalone worker
 * chunks for `new Worker(new URL(...))` — that idiom targets browser Web
 * Workers. Rather than fight the shared module graph (tree-shaking strips
 * the `parentPort` bootstrap because it looks unreachable from the main
 * bundle context), we run a focused second build after the main build
 * completes.
 *
 * The worker bundle is fully self-contained: sharp and node builtins are
 * marked external (loaded at runtime), and every other dep is inlined so
 * Node's `worker_threads` can load the file with zero additional
 * resolution.
 */

// `packages/server/src/infra/image/process-worker.ts` — same directory as
// this plugin, resolved via import.meta.url so it works from any app's
// vite config regardless of cwd.
const WORKER_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), 'process-worker.ts')
const OUTPUT_FILE = 'process-worker.js'

interface ProcessWorkerEntryPluginOptions {
  /** Directory the worker file lands in (the app's SSR build dir). Defaults to `<cwd>/build/server`. */
  outputDir?: string
}

export function processWorkerEntryPlugin(options: ProcessWorkerEntryPluginOptions = {}): Plugin {
  const outputDir = options.outputDir ?? resolve(process.cwd(), 'build/server')
  return {
    name: 'process-worker-entry',
    enforce: 'post',

    apply: 'build' as const,

    async closeBundle() {
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }
      const outFile = resolve(outputDir, OUTPUT_FILE)
      rmSync(outFile, { force: true })

      // Run an isolated ES build for just the worker. `write: false` lets us
      // capture the output chunks and write the relevant one ourselves,
      // keeping full control over the filename (no content hash).
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          // Node-targeted bundle: keeps runtime env access live (the
          // client define plugin would otherwise rewrite it to `{}`,
          // breaking `requireExternal`'s KOBATO_NATIVES_DIR lookup in the
          // worker) and treats node builtins as external.
          ssr: true,
          rolldownOptions: {
            input: WORKER_ENTRY,
            // `sharp` is a static import in the worker source now — keep
            // it external so this non-SEA bundle resolves node_modules at
            // runtime (the SEA bundle inlines it instead and redirects
            // its platform loads to `nativeRequire`). Node builtins must
            // stay external either way.
            external: ['sharp', 'pg', 'node:worker_threads', 'node:buffer', 'node:module', 'node:os', 'node:path'],
            output: {
              format: 'es',
              entryFileNames: OUTPUT_FILE,
            },
          },
        },
        resolve: {
          alias: {
            '@kobato/server': resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server', 'src'),
            '@kobato/shared': resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'src'),
          },
        },
      })

      // `build` with `write: false` returns RolldownOutput | RolldownOutput[].
      // (A watcher is only returned when `watch: true`, which we never set.)
      const results = Array.isArray(result) ? result : [result]
      for (const res of results) {
        if (!('output' in res)) {
          continue
        }
        for (const chunk of res.output) {
          if (chunk.type === 'chunk' && chunk.fileName.endsWith('.js')) {
            writeFileSync(outFile, chunk.code)
            return
          }
        }
      }
      throw new Error('process-worker-entry plugin: worker build produced no JS chunk')
    },
  }
}

import type { Plugin } from 'vite'

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

/**
 * Build `process-worker.ts` as a standalone Node worker file (the main
 * build can't emit `new Worker(new URL(...))` chunks). Sharp and node
 * builtins stay external; everything else is inlined.
 */

// This module lives at packages/server/src/infra/image/ — five levels below
// the repository root. The process cwd varies (build runs in apps/kobato,
// `pnpm dev` runs vite from the repository root), so every path must be
// anchored on import.meta.url, never on process.cwd().
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const WORKER_ENTRY = fileURLToPath(new URL('./process-worker.ts', import.meta.url))
const OUTPUT_DIR = resolve(REPO_ROOT, 'apps/kobato/build/server')
const OUTPUT_FILE = 'process-worker.js'

export function processWorkerEntryPlugin(): Plugin {
  return {
    name: 'process-worker-entry',
    enforce: 'post',

    apply: 'build' as const,

    async closeBundle() {
      if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true })
      }
      const outFile = resolve(OUTPUT_DIR, OUTPUT_FILE)
      rmSync(outFile, { force: true })

      // `write: false` lets us write the chunk ourselves: stable filename, no hash.
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          // Node target: keeps runtime env access live and node builtins external.
          ssr: true,
          rolldownOptions: {
            input: WORKER_ENTRY,
            // `sharp` resolves from node_modules here (the SEA bundle inlines it);
            // node builtins stay external either way.
            external: ['sharp', 'pg', 'node:worker_threads', 'node:buffer', 'node:module', 'node:os', 'node:path'],
            output: {
              format: 'es',
              entryFileNames: OUTPUT_FILE,
            },
          },
        },
        resolve: {
          alias: {
            '@kobato/server': resolve(REPO_ROOT, 'packages/server/src'),
            '@kobato/contracts': resolve(REPO_ROOT, 'packages/shared/contracts/src'),
          },
        },
      })

      // `write: false` returns RolldownOutput | RolldownOutput[] (never a watcher).
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

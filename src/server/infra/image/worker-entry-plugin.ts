import type { Plugin } from 'vite'

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'

/**
 * Build `process-worker.ts` as a standalone Node worker file (the main
 * build can't emit `new Worker(new URL(...))` chunks). Sharp and node
 * builtins stay external; everything else is inlined.
 */

const WORKER_ENTRY = resolve(process.cwd(), 'src/server/infra/image/process-worker.ts')
const OUTPUT_DIR = resolve(process.cwd(), 'build/server')
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
            '@/server': resolve(process.cwd(), 'src/server'),
            '@/shared': resolve(process.cwd(), 'src/shared'),
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

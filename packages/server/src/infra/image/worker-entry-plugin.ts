import type { Plugin } from 'vite'

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

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

      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          ssr: true,
          rolldownOptions: {
            input: WORKER_ENTRY,
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

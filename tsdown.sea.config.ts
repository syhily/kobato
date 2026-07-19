import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import { z } from 'zod'

// SEA bundle config — the single-executable pipeline (`pnpm run sea:build`,
// see scripts/sea/). Three fully self-contained outputs, each produced by
// its own single-entry config (rolldown rejects codeSplitting: false with
// multiple inputs):
//
//   main.cjs            — the SEA prelude (scripts/sea/entry.ts). Handles
//                         --version/--help/--smoke-natives, extracts native
//                         packages, materializes the server bundle, then
//                         dynamically imports it. CJS, no server graph.
//   server.mjs          — the whole vite-built server (build/server/index.js,
//                         ~400 chunks) inlined into ONE ESM file. Must stay
//                         ESM: src/server.ts uses top-level await, which no
//                         bundler can express in CJS. Embedded as the
//                         `server/server.mjs` asset and imported from the
//                         natives cache dir at runtime.
//   process-worker.cjs  — the image worker, embedded as a text asset and
//                         started via `new Worker(code, { eval: true })`.
//   smoke-worker.cjs    — the `--smoke-worker` entry (scripts/sea/
//                         smoke-worker.ts). Embedded as the
//                         `worker/smoke-worker.cjs` asset, materialized
//                         next to the natives dir like server.mjs, and
//                         imported by the prelude on demand.
//
// tsdown runs config-array entries in parallel, so none of them may
// `clean` the shared outDir — scripts/sea/build.ts wipes the
// intermediates dir before invoking tsdown.
//
// Native packages (sharp, sharp-ico, @napi-rs/canvas) are never statically
// imported — they go through `requireExternal` with variable specifiers,
// so the bundler never sees them and no externals config is needed.

const pkgSchema = z.object({
  version: z.string(),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const shared = {
  outDir: 'dist-sea/intermediates',
  clean: false,
  dts: false,
  fixedExtension: true,
  hash: false,
  platform: 'node',
  target: 'node22',
  alias: {
    '@': resolve(projectRoot, 'src'),
  },
  define: {
    __SEA_APP_VERSION__: JSON.stringify(pkg.version),
  },
} as const

export default defineConfig([
  {
    ...shared,
    entry: { main: 'scripts/sea/entry.ts' },
    format: ['cjs'],
    outputOptions: {
      codeSplitting: false,
      entryFileNames: '[name].cjs',
    },
  },
  {
    ...shared,
    entry: { server: 'build/server/index.js' },
    format: ['esm'],
    outputOptions: {
      codeSplitting: false,
      entryFileNames: '[name].mjs',
    },
  },
  {
    ...shared,
    entry: { 'process-worker': 'src/server/infra/image/process-worker.ts' },
    format: ['cjs'],
    outputOptions: {
      codeSplitting: false,
      entryFileNames: '[name].cjs',
    },
  },
  {
    ...shared,
    entry: { 'smoke-worker': 'scripts/sea/smoke-worker.ts' },
    format: ['cjs'],
    outputOptions: {
      codeSplitting: false,
      entryFileNames: '[name].cjs',
    },
  },
])

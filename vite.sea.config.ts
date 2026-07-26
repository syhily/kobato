// SEA bundle config — the single-executable pipeline (`pnpm run sea:build`,
// see scripts/sea/). Three self-contained outputs into
// dist-sea/intermediates/, one per `vite build` invocation (the Vite CLI
// takes a single config; scripts/sea/build.ts selects the bundle via the
// SEA_BUNDLE env var):
//
//   SEA_BUNDLE=server  server.mjs         — the INJECTED main of the
//                      binary (`mainFormat: "module"`): the sea-cli /
//                      sea-bootstrap entry shim
//                      (scripts/sea/server-entry.ts) plus the whole
//                      vite-built server inlined into ONE ESM file. Must
//                      stay ESM: src/server.ts uses top-level await,
//                      which no bundler can express in CJS.
//   SEA_BUNDLE=worker  process-worker.cjs — the image worker, embedded as
//                      a text asset and started via
//                      `new Worker(code, { eval: true })`.
//   SEA_BUNDLE=smoke   smoke-worker.cjs   — the `--smoke-worker` entry
//                      (scripts/sea/smoke-worker.ts). Embedded as the
//                      `worker/smoke-worker.cjs` asset and dispatched by
//                      the binary's `--smoke-worker` flag via
//                      `new Worker(code, { eval: true })`.
//
// sharp / sharp-ico / @napi-rs/canvas ARE statically imported and inlined
// (`ssr.noExternal: true`); the redirect-native-requires plugin rewrites
// their internal platform loads to `nativeRequire(...)` so only node
// builtins stay external. Node builtins are external automatically for
// SSR builds — no externals config is needed.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { z } from 'zod'

import { redirectNativeRequiresPlugin } from './scripts/sea/redirect-native-requires.ts'

const pkgSchema = z.object({
  version: z.string(),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const BUNDLES = {
  server: { entry: 'scripts/sea/server-entry.ts', format: 'es', fileName: 'server.mjs' },
  worker: { entry: 'src/server/infra/image/process-worker.ts', format: 'cjs', fileName: 'process-worker.cjs' },
  smoke: { entry: 'scripts/sea/smoke-worker.ts', format: 'cjs', fileName: 'smoke-worker.cjs' },
} as const

function selectBundle(): { entry: string; format: 'cjs' | 'es'; fileName: string } {
  const name = process.env.SEA_BUNDLE
  if (name === 'server' || name === 'worker' || name === 'smoke') {
    return BUNDLES[name]
  }
  throw new Error(`SEA_BUNDLE must be one of ${Object.keys(BUNDLES).join('|')} (got "${name ?? ''}")`)
}

const bundle = selectBundle()

export default defineConfig({
  root: projectRoot,
  logLevel: 'info',
  resolve: {
    alias: { '@': join(projectRoot, 'src') },
  },
  define: {
    // Baked into the bundle from package.json — a single executable has
    // no package.json to read at runtime (see `@/server/infra/sea-cli`).
    __SEA_APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [redirectNativeRequiresPlugin()],
  build: {
    outDir: 'dist-sea/intermediates',
    // The three builds run sequentially into the same dir — never wipe it
    // (scripts/sea/build.ts cleans the intermediates dir up front).
    emptyOutDir: false,
    target: 'node26',
    // Minified single files: the bundles ship inside the binary and are
    // never debugged from disk. Runtime name lookups are safe — every
    // error-name contract (`DomainError`, `WorkerDomainError`) is an
    // explicit `this.name = …` assignment, not class-name inference.
    minify: true,
    sourcemap: false,
    ssr: bundle.entry,
    rolldownOptions: {
      output: {
        format: bundle.format,
        // Single-file output (the deprecated `inlineDynamicImports: true`).
        codeSplitting: false,
        entryFileNames: bundle.fileName,
      },
    },
  },
  ssr: {
    // Inline every dependency (node builtins stay external automatically).
    noExternal: true,
  },
})

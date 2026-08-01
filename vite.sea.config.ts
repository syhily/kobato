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
//   SEA_BUNDLE=worker  process-worker.mjs — the image worker, embedded as
//                      a text asset and started via
//                      `new Worker(code, { eval: true, execArgv: ['--input-type=module'] })`.
//   SEA_BUNDLE=smoke   smoke-worker.mjs   — the `--smoke-worker` entry
//                      (scripts/sea/smoke-worker.ts). Embedded as the
//                      `worker/smoke-worker.mjs` asset and dispatched by
//                      the binary's `--smoke-worker` flag via the same
//                      eval-worker mechanism.
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
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const BUNDLES = {
  server: { entry: 'scripts/sea/server-entry.ts', format: 'es', fileName: 'server.mjs' },
  worker: { entry: 'src/server/infra/image/process-worker.ts', format: 'es', fileName: 'process-worker.mjs' },
  smoke: { entry: 'scripts/sea/smoke-worker.ts', format: 'es', fileName: 'smoke-worker.mjs' },
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
    // The same six `__APP_*__` globals vite.config.ts defines for the
    // regular build: `@/shared/config/version` is consumed by the server
    // graph (self-update domain, `kobato rollback` / `kobato doctor` via
    // binary-rollback.ts and self-update-gate.ts), so the binary needs
    // them too.
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
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

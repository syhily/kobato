// SEA bundle config — the single-executable pipeline (`pnpm run sea:build`,
// see scripts/sea/). Two build lines, selected via the SEA_TARGET env var
// (set by scripts/sea/build.ts per invocation; see scripts/sea/target.ts):
//
//   core (default):
//     SEA_BUNDLE=server  server.mjs         — the INJECTED main of the
//                        binary (`mainFormat: "module"`): the sea-cli /
//                        sea-bootstrap entry shim
//                        (scripts/sea/server-entry.ts) plus the whole
//                        vite-built core server inlined into ONE ESM
//                        file. Must stay ESM: the core server uses
//                        top-level await, which no bundler can express
//                        in CJS.
//     SEA_BUNDLE=worker  process-worker.mjs — the image worker, embedded
//                        as a text asset and started via
//                        `new Worker(code, { eval: true, execArgv: ['--input-type=module'] })`.
//     SEA_BUNDLE=smoke   smoke-worker.mjs   — the `--smoke-worker` entry
//                        (scripts/sea/smoke-worker.ts). Embedded as the
//                        `worker/smoke-worker.mjs` asset and dispatched
//                        by the binary's `--smoke-worker` flag via the
//                        same eval-worker mechanism.
//
//   frontend:
//     SEA_BUNDLE=server  server.mjs         — the injected main: the
//                        minimal frontend CLI (scripts/sea/frontend-cli.ts)
//                        plus the vite-built public server inlined into
//                        ONE ESM file. No worker/smoke bundles — the
//                        public service has no image worker and no
//                        natives to smoke.
//
// sharp / sharp-ico / @napi-rs/canvas ARE statically imported and inlined
// for the core line (`ssr.noExternal: true`); the redirect-native-requires
// plugin rewrites their internal platform loads to `nativeRequire(...)` so
// only node builtins stay external. The frontend line stubs those packages
// instead (see scripts/sea/stub-native-packages.ts) — its SSR graph pulls
// the shared server domains statically, but the native code paths are
// core-only and never reached. Node builtins are external automatically
// for SSR builds — no externals config is needed.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { z } from 'zod'

import { redirectNativeRequiresPlugin } from './scripts/sea/redirect-native-requires.ts'
import { stubNativePackagesPlugin } from './scripts/sea/stub-native-packages.ts'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

// Site metadata is owned by the core app's package.json (see
// apps/core/vite.config.ts) — both SEA lines read it so the baked-in
// version/site name never drift.
const pkg = pkgSchema.parse(JSON.parse(readFileSync('./apps/core/package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

// The build lines share the bundle names but never the intermediates dir
// (paths.ts namespaces them per target); the target is fixed per build run.
const rawTarget = process.env.SEA_TARGET
if (rawTarget !== 'core' && rawTarget !== 'frontend') {
  throw new Error(`SEA_TARGET must be one of core|frontend (got "${rawTarget ?? ''}")`)
}
const target: 'core' | 'frontend' = rawTarget

interface BundleSpec {
  entry: string
  format: 'cjs' | 'es'
  fileName: string
}

const BUNDLES: Record<'core' | 'frontend', Partial<Record<'server' | 'worker' | 'smoke', BundleSpec>>> = {
  core: {
    server: { entry: 'scripts/sea/server-entry.ts', format: 'es', fileName: 'server.mjs' },
    worker: {
      entry: 'packages/server/src/infra/image/process-worker.ts',
      format: 'es',
      fileName: 'process-worker.mjs',
    },
    smoke: { entry: 'scripts/sea/smoke-worker.ts', format: 'es', fileName: 'smoke-worker.mjs' },
  },
  frontend: {
    server: { entry: 'scripts/sea/server-entry-frontend.ts', format: 'es', fileName: 'server.mjs' },
  },
}

function selectBundle(): BundleSpec {
  const name = process.env.SEA_BUNDLE
  if (name === 'server' || name === 'worker' || name === 'smoke') {
    const bundle = BUNDLES[target][name]
    if (bundle === undefined) {
      throw new Error(`SEA_BUNDLE "${name}" does not exist for SEA_TARGET "${target}" (frontend has no worker/smoke)`)
    }
    return bundle
  }
  throw new Error(`SEA_BUNDLE must be one of ${Object.keys(BUNDLES[target]).join('|')} (got "${name ?? ''}")`)
}

const bundle = selectBundle()

export default defineConfig({
  root: projectRoot,
  logLevel: 'info',
  resolve: {
    alias: {
      // Both SEA entries import `@kobato/*` package specifiers — the
      // workspace symlink alone does not resolve their deep paths
      // (packages/*/src/...) in a bare vite config, so map them
      // explicitly, exactly like the per-app vite configs do.
      //
      // `@kobato/client` and `@kobato/editor` are deliberately NOT mapped:
      // their only reachability was the server bundle's transitive
      // editor→client chain, which stage 5 eliminated (server→shared only
      // — the built app bundles under apps/*/build inline every @kobato
      // specifier at app build time, so the SEA re-bundle never sees
      // them). A future graph edge that introduces either specifier fails
      // the build here instead of silently resolving.
      '@kobato/shared': join(projectRoot, 'packages', 'shared', 'src'),
      '@kobato/server': join(projectRoot, 'packages', 'server', 'src'),
      '@kobato/ui': join(projectRoot, 'packages', 'ui', 'src'),
      '@kobato/sdk': join(projectRoot, 'packages', 'sdk', 'src'),
      // The built app bundles have their own `@/*` resolved already; keep
      // an `@` mapping for the entry shims' sake (both live under scripts/).
      '@': join(projectRoot, 'apps', target, 'src'),
    },
  },
  define: {
    // Baked into the bundle from package.json — a single executable has
    // no package.json to read at runtime (see `@/server/infra/sea-cli`).
    __SEA_APP_VERSION__: JSON.stringify(pkg.version),
    // The same six `__APP_*__` globals the app vite configs define:
    // `@kobato/shared/config/version` is consumed by the server graph
    // (self-update domain, `kobato rollback` / `kobato doctor` via
    // binary-rollback.ts and self-update-gate.ts), so the binary needs
    // them too.
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  plugins: [
    redirectNativeRequiresPlugin(),
    // Frontend line only: the public SSR graph statically pulls the
    // shared server domains, whose native packages (sharp / canvas /
    // duckdb) are core-only — never executed here. Stub them so their
    // module-scope platform detection never runs in the binary.
    ...(target === 'frontend' ? [stubNativePackagesPlugin()] : []),
  ],
  build: {
    outDir: resolve(projectRoot, 'dist-sea', target === 'core' ? 'intermediates' : 'intermediates-frontend'),
    // The per-target builds run sequentially into the same dir — never
    // wipe it (scripts/sea/build.ts cleans the intermediates dir up front).
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

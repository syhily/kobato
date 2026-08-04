import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { z } from 'zod'

// The vite config module graph is bundled WITHOUT the project's resolve
// aliases, so server-package imports use relative specifiers (same pattern
// as the pre-split root config).
import { reactRouterHonoServer } from '../../packages/server/src/infra/hono/dev.ts'
import { processWorkerEntryPlugin } from '../../packages/server/src/infra/image/worker-entry-plugin.ts'
import { routeWarmupPlugin } from '../../packages/server/src/infra/route-warmup.ts'
import { TIER1_ROUTES, TIER2_PREFIXES } from './src/warmup.ts'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

// Site metadata (__APP_*__ compile-time globals) is owned by the core app's
// package.json — both apps read it so the version/site name never drift.
const pkg = pkgSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(projectRoot, '..', '..')
const packagesRoot = resolve(repoRoot, 'packages')

// The sanitize facade (packages/ui/src/lib/sanitize-html.ts) imports the node
// engine (sanitize-html). For the browser bundle this plugin swaps that
// specifier to the DOMPurify engine, keeping sanitize-html's Node-only
// dependency chain (postcss, source-map-js, fs/path/url) out of the client —
// per-environment `resolve.alias` is not a thing in vite, so it takes a plugin.
// The editor package carries its own facade + engines, so its node engine is
// routed to its own browser twin, keeping the copy self-contained.
const sanitizeEngineAliasPlugin = (): Plugin => ({
  name: 'sanitize-html-engine-alias',
  enforce: 'pre',
  resolveId: {
    filter: { id: /sanitize-html-engine\.node$/ },
    handler(id) {
      if (this.environment.name === 'client') {
        if (id.includes('/editor/src/lib/sanitize-html-engine.node')) {
          return resolve(packagesRoot, 'editor/src/lib/sanitize-html-engine.browser.ts')
        }
        return resolve(packagesRoot, 'ui/src/lib/sanitize-html-engine.browser.ts')
      }
      return null
    },
  },
})

export default defineConfig(({ command }) => ({
  ssr:
    command === 'serve'
      ? {
          // Workspace packages are source, not installed deps — never
          // externalize them from the SSR graph (dev + build).
          noExternal: [
            '@kobato/shared',
            '@kobato/client',
            '@kobato/server',
            '@kobato/ui',
            '@kobato/editor',
            '@kobato/sdk',
          ],
        }
      : {
          noExternal: true,
          target: 'node',
          // sharp / @napi-rs/canvas / @duckdb/node-api can never be
          // bundled (their .node loads are unloadable). External here,
          // inlined (and redirected) by vite.sea.config.ts there.
          external: ['sharp', '@napi-rs/canvas', '@duckdb/node-api'],
        },
  environments: {
    ssr: {
      // React Router ≥8.2 strips the `node` resolve condition from the ssr
      // environment unless a Node adapter (@react-router/node etc.) appears
      // in `dependencies` — ours live in devDependencies by convention (see
      // AGENTS.md). Without `node`, packages that only expose
      // node-conditional exports (e.g. mailgun.js) fail to resolve. Restore
      // the condition explicitly — dev SSR needs it just as much as build.
      resolve: {
        conditions: ['node'],
      },
      ...(command === 'build'
        ? {
            build: {
              // Emit assets referenced by the server graph (the cnfs.wasm
              // `?init` import) into build/server/assets — Vite 8 defaults
              // this off for non-client consumers, and React Router's
              // `build.ssrEmitAssets` is no longer honored per-environment.
              emitAssets: true,
              rolldownOptions: {
                input: 'src/server.ts',
              },
            },
          }
        : {}),
    },
  },
  plugins: [
    sanitizeEngineAliasPlugin(),
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    processWorkerEntryPlugin(),
    routeWarmupPlugin({ tier1Routes: TIER1_ROUTES, tier2Prefixes: TIER2_PREFIXES }),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': resolve(projectRoot, 'src'),
      '#': resolve(repoRoot, 'tests'),
      '@kobato/shared': resolve(packagesRoot, 'shared/src'),
      '@kobato/client': resolve(packagesRoot, 'client/src'),
      '@kobato/server': resolve(packagesRoot, 'server/src'),
      '@kobato/ui': resolve(packagesRoot, 'ui/src'),
      '@kobato/editor': resolve(packagesRoot, 'editor/src'),
      '@kobato/sdk': resolve(packagesRoot, 'sdk/src'),
    },
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  server: {
    port: 4321,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
}))

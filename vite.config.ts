import type { OxfmtConfig } from 'oxfmt'
import type { OxlintConfig } from 'oxlint'
import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { reactRouterHonoServer } from 'react-router-hono-server/dev'
import devtoolsJson from 'vite-plugin-devtools-json'
import { defineConfig } from 'vite-plus'

import oxfmtConfig from './oxfmt.config.ts'
import oxlintConfig from './oxlint.config.ts'

export default defineConfig({
  fmt: oxfmtConfig as OxfmtConfig,
  lint: oxlintConfig as OxlintConfig,
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      // v8 reporter ships with vite-plus/vitest. Keep the report local-only;
      // CI gating is opt-in via `vp test run --coverage`.
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/server/db/schema.ts',
        'src/server/db/types/**',
        'src/env.d.ts',
        'src/blog.config.ts',
        'src/routes.ts',
        'src/entry.client.tsx',
        'src/entry.server.tsx',
        'src/root.tsx',
        // Routes are exercised through route-layer tests; the route module
        // file itself is mostly JSX glue (no logic worth measuring).
        'src/routes/**/*.tsx',
        // Pure asset/script bundles served to the browser; covered through
        // their consumers in `tests/snapshot.components.*`.
        'src/assets/**',
        'src/ui/**',
      ],
      thresholds: {
        lines: 70,
        branches: 75,
        functions: 70,
        statements: 70,
      },
    },
  },
  staged: {
    '*.{js,jsx,ts,tsx,mjs,cjs}': 'vp fmt && vp lint',
  },
  plugins: [devtoolsJson(), reactRouterHonoServer(), ...(reactRouter() as Plugin[]), tailwindcss()] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: true,
    // The admin editor pulls in the entire Tiptap + ProseMirror stack;
    // grouping them into one named chunk lets the browser cache it
    // independently of route modules and stops the chunk-size warning
    // from masking accidental growth in unrelated bundles.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror-')) {
            return 'editor-tiptap'
          }
          return undefined
        },
      },
    },
  },
  server: {
    port: 4321,
    // Pre-transform every route module on dev-server boot. Without
    // this, the first navigation to a route triggers Vite's
    // dependency optimizer mid-request, which reloads the page
    // ("optimized dependencies changed. reloading"). Warming up the
    // route entrypoints (and the entry / root shells) front-loads the
    // optimizer scan so every subsequent navigation hits an already-
    // optimized graph. The glob expands to ~55 files — well under
    // Vite's recommended ceiling for warmup lists.
    warmup: {
      // `entry.client.tsx` is intentionally absent — React Router's
      // dev server injects its own default entry. Listing it here
      // would emit a "Failed to load url" pre-transform error on boot.
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
})

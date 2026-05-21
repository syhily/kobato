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
        'src/routes/**/*.tsx',
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
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
})

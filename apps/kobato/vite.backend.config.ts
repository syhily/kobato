import type { PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { processWorkerEntryPlugin } from '@kobato/server/infra/image/worker-entry-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  ssr: {
    noExternal: true,
    target: 'node',
    external: ['sharp', '@napi-rs/canvas', '@duckdb/node-api'],
  },
  builder: {
    buildApp: async (builder) => {
      await builder.build(builder.environments.ssr)
    },
  },
  environments: {
    ssr: {
      resolve: {
        conditions: ['node'],
      },
      build: {
        emitAssets: true,
        outDir: 'build/server',
        emptyOutDir: true,
        chunkSizeWarningLimit: 500,
        rolldownOptions: {
          input: {
            index: 'src/server.ts',
          },
          output: {
            entryFileNames: 'index.js',
            chunkFileNames: 'assets/[name]-[hash].js',
          },
        },
      },
    },
  },
  plugins: [sanitizeEngineAliasPlugin(), inlinePackageDataPlugin(), processWorkerEntryPlugin()] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  define: appDefines(readAppPackage()),
})

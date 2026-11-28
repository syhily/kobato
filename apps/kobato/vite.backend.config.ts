import type { PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { honoDevHost } from '@kobato/pack/vite/hono-dev-host'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { processWorkerEntryPlugin } from '@kobato/server/infra/image/worker-entry-plugin'
import { defineConfig } from 'vite'

const ENTRY = 'src/server.ts'

export default defineConfig((env) => {
  const devHost = env.command === 'serve'
  return {
    appType: 'custom',
    ...(devHost
      ? {}
      : {
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
        }),
    environments: {
      ssr: {
        resolve: {
          conditions: ['node'],
        },
        ...(devHost
          ? {}
          : {
              build: {
                emitAssets: true,
                outDir: 'build/server',
                emptyOutDir: true,
                chunkSizeWarningLimit: 500,
                rolldownOptions: {
                  input: { index: ENTRY },
                  output: {
                    entryFileNames: 'index.js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                  },
                },
              },
            }),
      },
    },
    plugins: devHost
      ? [honoDevHost({ entry: ENTRY })]
      : ([sanitizeEngineAliasPlugin(), inlinePackageDataPlugin(), processWorkerEntryPlugin()] as PluginOption[]),
    resolve: {
      tsconfigPaths: true,
    },
    define: appDefines(readAppPackage()),
    server: {
      host: '127.0.0.1',
      port: 4320,
    },
  }
})

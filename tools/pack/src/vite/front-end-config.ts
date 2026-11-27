import type { ConfigEnv, Plugin, PluginOption, ServerOptions, UserConfigFnObject } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { reactCompilerPlugin } from '@kobato/pack/vite/react-compiler-plugin'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'

const CLIENT_CHUNK_SIZE_WARNING_LIMIT = 2500
const ROOT_CHUNK_SIZE_WARNING_LIMIT = 500
const ROUTE_CLIENT_FILES = ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}']

export interface FrontEndPlugins {
  leading?: PluginOption[]
  trailing?: PluginOption[]
}

export interface FrontEndConfigOptions {
  appDir: string
  port: number
  identityDir?: string
  base?: (env: ConfigEnv) => string
  plugins?: FrontEndPlugins
  server?: ServerOptions
  optimizeDeps?: boolean
  serverEntry?: string
  ssrExternals?: readonly string[]
}

export function frontEndConfig(options: FrontEndConfigOptions): UserConfigFnObject {
  return (env) => {
    const build = env.command === 'build'
    const serverBuild = build && options.serverEntry !== undefined
    return {
      ...(options.base === undefined ? {} : { base: options.base(env) }),
      ...(build
        ? {
            ssr: {
              noExternal: true,
              target: 'node',
              ...(options.ssrExternals === undefined ? {} : { external: [...options.ssrExternals] }),
            },
          }
        : {}),
      environments: {
        client: {
          build: {
            chunkSizeWarningLimit: CLIENT_CHUNK_SIZE_WARNING_LIMIT,
          },
        },
        ssr: {
          resolve: {
            conditions: ['node'],
          },
          ...(serverBuild
            ? {
                build: {
                  emitAssets: true,
                  rolldownOptions: {
                    input: options.serverEntry,
                  },
                },
              }
            : {}),
        },
      },
      plugins: [
        ...(options.plugins?.leading ?? []),
        sanitizeEngineAliasPlugin(),
        inlinePackageDataPlugin(),
        reactCompilerPlugin(),
        ...(reactRouter() as Plugin[]),
        tailwindcss(),
        ...(options.plugins?.trailing ?? []),
      ],
      resolve: {
        tsconfigPaths: true,
      },
      ...(options.optimizeDeps ? { optimizeDeps: appOptimizeDeps(options.appDir) } : {}),
      build: {
        emptyOutDir: true,
        chunkSizeWarningLimit: ROOT_CHUNK_SIZE_WARNING_LIMIT,
      },
      define: appDefines(readAppPackage(options.identityDir)),
      server: {
        warmup: {
          clientFiles: ROUTE_CLIENT_FILES,
        },
        ...options.server,
        port: options.port,
      },
    }
  }
}

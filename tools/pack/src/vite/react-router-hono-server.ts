import type { Config as ReactRouterConfig } from '@react-router/dev/config'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, UserConfig, ViteDevServer } from 'vite'

import honoDevServer, { type DevServerOptions } from '@hono/vite-dev-server'
import nodeAdapter from '@hono/vite-dev-server/node'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import fs from 'node:fs'
import path from 'node:path'

export const VITE_DEV_SERVER_SLOT = Symbol.for('kobato.vite-dev-server')

interface ReactRouterHonoServerEnv {
  readonly REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY: string
  readonly REACT_ROUTER_HONO_SERVER_ASSETS_DIR: string
  readonly REACT_ROUTER_HONO_SERVER_BASENAME: string
}

type MetaEnv<T> = {
  [K in keyof T as `import.meta.env.${string & K}`]: T[K]
}

type ReactRouterHonoServerPluginOptions = {
  serverEntryPoint?: string
  dev?: {
    exclude?: DevServerOptions['exclude']
    export?: DevServerOptions['export']
  }
}

export function reactRouterHonoServer(options: ReactRouterHonoServerPluginOptions = {}): Plugin {
  let pluginConfig: PluginConfig
  let devServerPlugin: Plugin | undefined

  return {
    name: 'react-router-hono-server',
    enforce: 'post',
    async config(config, _env) {
      pluginConfig = resolvePluginConfig(config, options)

      if (!pluginConfig) {
        return
      }

      const isEnvironmentApiEnabled = unsafeCast<{ v8_viteEnvironmentApi?: boolean }>(
        pluginConfig.future,
      ).v8_viteEnvironmentApi

      const serverEntryPoint = pluginConfig.serverEntryPoint

      const baseConfig = {
        define: {
          'import.meta.env.REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY': JSON.stringify(pluginConfig.buildDirectory),
          'import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR': JSON.stringify(pluginConfig.assetsDir),
          'import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME': JSON.stringify(pluginConfig.basename),
        } satisfies MetaEnv<ReactRouterHonoServerEnv>,
        ssr: {
          noExternal: [],
        },
      } satisfies UserConfig

      if (!isEnvironmentApiEnabled && !pluginConfig.isSsrBuild) {
        return baseConfig
      }

      let reactRouterBuildFile = pluginConfig.serverBuildFile

      if (reactRouterBuildFile === 'index.js') {
        reactRouterBuildFile = 'assets/server-build.js'
      }

      const ssrConfig = {
        build: {
          rolldownOptions: {
            input: serverEntryPoint,
            output: {
              entryFileNames: (chunk) => {
                unsafeCast<{ facadeModuleId?: string }>(chunk).facadeModuleId = '\0virtual:react-router/server-build'
                return 'index.js'
              },
              chunkFileNames: (chunk) => {
                if (chunk.name === 'server-build') {
                  return reactRouterBuildFile
                }
                return 'assets/[name]-[hash].js'
              },
              manualChunks: (id, meta) => {
                if (meta.getModuleInfo(id)?.importers.some((importer) => importer.includes(serverEntryPoint))) {
                  return path.basename(id, path.extname(id))
                }
              },
            },
          },
        },
      } satisfies Omit<UserConfig, 'plugins'>

      if (isEnvironmentApiEnabled) {
        return {
          ...baseConfig,
          environments: {
            ssr: unsafeCast<UserConfig['environments'] extends Record<string, infer V> ? V : never>(ssrConfig),
          },
        }
      }

      return {
        ...baseConfig,
        ...ssrConfig,
      }
    },
    async configureServer(server) {
      forceDevMode()

      Reflect.set(globalThis, VITE_DEV_SERVER_SLOT, server)

      if (!pluginConfig) {
        return
      }

      if (devServerPlugin) {
        return
      }

      devServerPlugin = honoDevServer({
        adapter: nodeAdapter,
        injectClientScript: false,
        entry: pluginConfig.serverEntryPoint,
        export: options.dev?.export || 'default',
        exclude: [
          new RegExp(
            `^(?=\\/${pluginConfig.appDirectory.replace(/^[/\\]+|[/\\]+$/g, '').replaceAll(/[/\\]+/g, '/')}\\/)((?!.*\\.data(\\?|$)).*\\..*(\\?.*)?$)`,
          ),
          new RegExp(
            `^(?=\\/${
              pluginConfig.appDirectory
                .replace(/^[/\\]+|[/\\]+$/g, '')
                .replaceAll(/[/\\]+/g, '/')
                .split('/')[0]
            }\\/)((?!.*\\.data(\\?|$)).*\\..*(\\?.*)?$)`,
          ),
          /\?import(\?.*)?$/,
          /^\/@.+$/,
          /^\/node_modules\/.*/,
          `^(?=\\/${pluginConfig.appDirectory.replace(/^[/\\]+|[/\\]+$/g, '').replace(/[/\\]+/g, '/')}/**/.*/**)`,
          `^(?=\\/${
            pluginConfig.appDirectory
              .replace(/^[/\\]+|[/\\]+$/g, '')
              .replace(/[/\\]+/g, '/')
              .split('/')[0]
          }/**/.*/**)`,
          ...(pluginConfig.dev?.exclude || []),
        ],
      })

      server.middlewares.use((req: IncomingMessage, _res: ServerResponse, next: () => void) => {
        req.rawHeaders.push('x-remote-address', req.socket.remoteAddress || 'unknown')
        req.rawHeaders.push('x-remote-port', String(req.socket.remotePort || 'unknown'))
        req.rawHeaders.push('x-remote-family', req.socket.remoteFamily || 'unknown')
        next()
      })

      if (typeof devServerPlugin.configureServer === 'function') {
        await unsafeCast<(server: ViteDevServer) => void | Promise<void>>(devServerPlugin.configureServer)(server)
      } else {
        throw new Error('Cannot apply dev server plugin configureServer hook')
      }
    },
  }
}

type ReactRouterPluginContext = {
  reactRouterConfig: Required<ReactRouterConfig>
  environmentBuildContext: { name: 'client' | 'ssr' } | null
  rootDirectory: string
  entryClientFilePath: string
  entryServerFilePath: string
}

function resolvePluginConfig(config: UserConfig, options: ReactRouterHonoServerPluginOptions) {
  if (!('__reactRouterPluginContext' in config)) {
    return null
  }

  const { reactRouterConfig, environmentBuildContext, rootDirectory } = unsafeCast<ReactRouterPluginContext>(
    config.__reactRouterPluginContext,
  )
  const buildDirectory = path.relative(rootDirectory, reactRouterConfig.buildDirectory)
  const appDirectory = path.relative(rootDirectory, reactRouterConfig.appDirectory)
  const isSsrBuild = environmentBuildContext?.name === 'ssr'
  const assetsDir = config.build?.assetsDir || 'assets'
  const serverEntryPoint = options.serverEntryPoint || findDefaultServerEntry(rootDirectory, appDirectory)
  const serverBuildFile = reactRouterConfig.serverBuildFile
  const basename = reactRouterConfig.basename
  const future = reactRouterConfig.future

  return {
    rootDirectory,
    buildDirectory,
    appDirectory,
    isSsrBuild,
    assetsDir,
    serverEntryPoint,
    dev: options.dev,
    serverBuildFile,
    basename,
    future,
  }
}

type PluginConfig = ReturnType<typeof resolvePluginConfig>

function forceDevMode(): void {
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'development'
  }
}

function findDefaultServerEntry(rootDirectory: string, appDirectory: string): string {
  const fileWay = `${appDirectory}/server.ts`
  const folderWay = `${appDirectory}/server/index.ts`

  if (fs.existsSync(path.resolve(rootDirectory, fileWay))) {
    return fileWay
  }

  if (fs.existsSync(path.resolve(rootDirectory, folderWay))) {
    return folderWay
  }

  throw new Error(`No server entry point found at ${fileWay} or ${folderWay} — pass serverEntryPoint explicitly`)
}

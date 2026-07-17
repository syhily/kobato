import type { UserConfig } from 'vite'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// dev.ts pulls in @hono/vite-dev-server (default + /node) and reads the
// React Router plugin context off `config.__reactRouterPluginContext`. To
// drive the plugin hooks in isolation we stub the Hono dev-server factory
// and `node:fs` so the entry-resolution + configureServer paths can run
// deterministically without a real Vite project on disk.

const honoDevServerMock = vi.hoisted(() => vi.fn((..._args: unknown[]) => ({ configureServer: vi.fn() })))
const nodeAdapterMock = vi.hoisted(() => ({ __esModule: true, default: vi.fn() }))
const existsSyncMock = vi.hoisted(() => vi.fn((_path: string) => false))
const setViteDevServerMock = vi.hoisted(() => vi.fn())
const stderrWriteMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('@hono/vite-dev-server', () => ({
  default: (...args: unknown[]) => honoDevServerMock(...args),
}))
vi.mock('@hono/vite-dev-server/node', () => nodeAdapterMock)
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, existsSync: existsSyncMock, default: { ...actual, existsSync: existsSyncMock } }
})
vi.mock('@/server/infra/hono/dev-server-ref', () => ({
  setViteDevServer: setViteDevServerMock,
  getViteDevServer: vi.fn(() => null),
}))

// Capture NODE_ENV manipulation across runs.
const originalNodeEnv = process.env.NODE_ENV

function captureStderr() {
  process.stderr.write = stderrWriteMock as typeof process.stderr.write
}

function restoreStderr() {
  process.stderr.write = process.stderr.write
}

// Build a minimal React-Router plugin context shape that resolvePluginConfig
// understands. appDirectory/buildDirectory must be absolute under rootDirectory
// so `path.relative(rootDirectory, appDirectory)` yields 'app'.
function reactRouterContext(overrides: Record<string, unknown> = {}) {
  return {
    __reactRouterPluginContext: {
      reactRouterConfig: {
        appDirectory: '/project/app',
        buildDirectory: '/project/build',
        serverBuildFile: 'index.js',
        basename: '/',
        future: {},
      },
      environmentBuildContext: null,
      rootDirectory: '/project',
      entryClientFilePath: '/project/app/entry.client.tsx',
      entryServerFilePath: '/project/app/entry.server.tsx',
      ...overrides,
    },
  }
}

function viteUserConfig(rrCtx: Record<string, unknown> = {}, userCfg: UserConfig = {}): UserConfig {
  return { ...(rrCtx as UserConfig), ...userCfg } as UserConfig
}

const { reactRouterHonoServer } = await import('@/server/infra/hono/dev')

describe('infra/hono/dev — reactRouterHonoServer plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReset()
    existsSyncMock.mockReturnValue(false)
    honoDevServerMock.mockReset()
    honoDevServerMock.mockReturnValue({ configureServer: vi.fn() })
    captureStderr()
    stderrWriteMock.mockReset()
    stderrWriteMock.mockReturnValue(true)
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    restoreStderr()
    process.env.NODE_ENV = originalNodeEnv
  })

  describe('resolveId / load', () => {
    it('returns the virtual module id when asked for it', () => {
      const plugin = reactRouterHonoServer()
      const resolveId = plugin.resolveId as (id: string) => string | undefined
      expect(resolveId('\0virtual:react-router-hono-server/server')).toBe('\0virtual:react-router-hono-server/server')
    })

    it('returns undefined for unrelated ids', () => {
      const plugin = reactRouterHonoServer()
      const resolveId = plugin.resolveId as (id: string) => string | undefined
      expect(resolveId('app/server.ts')).toBeUndefined()
    })

    it('load() emits the virtual server bootstrap module', () => {
      const plugin = reactRouterHonoServer()
      const load = plugin.load as (id: string) => string | undefined
      const code = load('\0virtual:react-router-hono-server/server')!
      expect(code).toContain('createHonoServer')
      expect(code).toContain('await')
    })

    it('load() returns undefined for unrelated ids', () => {
      const plugin = reactRouterHonoServer()
      const load = plugin.load as (id: string) => string | undefined
      expect(load('app/foo.ts')).toBeUndefined()
    })
  })

  describe('config() — no React Router context', () => {
    it('returns undefined when config has no __reactRouterPluginContext', async () => {
      const plugin = reactRouterHonoServer()
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = await config({} as UserConfig, { mode: 'web', command: 'serve' } as never)
      expect(result).toBeUndefined()
    })
  })

  describe('config() — non-SSR, no environment API', () => {
    it('returns only baseConfig when isSsrBuild is false and env API is off', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect(result.define).toMatchObject({
        'import.meta.env.REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY': JSON.stringify('build'),
        'import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR': JSON.stringify('assets'),
        'import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME': JSON.stringify('/'),
      })
      // No build/rolldownOptions in the non-SSR path.
      expect(result.build).toBeUndefined()
      expect(result.environments).toBeUndefined()
    })

    it('uses a custom assetsDir when provided', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext(), { build: { assetsDir: 'static' } })
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect(result.define!['import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR']).toBe(JSON.stringify('static'))
    })
  })

  describe('config() — SSR build path', () => {
    it('rewrites index.js serverBuildFile to assets/server-build.js and emits rollup config', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      const output = result.build!.rolldownOptions!.output as Record<'entryFileNames' | 'chunkFileNames', unknown>
      // entryFileNames always returns 'index.js' and rewrites facadeModuleId.
      const chunk = { facadeModuleId: 'orig' } as Record<string, string>
      expect((output.entryFileNames as (c: unknown) => string)(chunk)).toBe('index.js')
      expect(chunk.facadeModuleId).toBe('\0virtual:react-router/server-build')

      // server-build chunk -> reactRouterBuildFile (rewritten).
      expect((output.chunkFileNames as (c: { name: string }) => string)({ name: 'server-build' })).toBe(
        'assets/server-build.js',
      )
      // other chunks -> hashed asset path template (Vite interpolates [name]/[hash]).
      expect((output.chunkFileNames as (c: { name: string }) => string)({ name: 'other' })).toBe(
        'assets/[name]-[hash].js',
      )
    })

    it('keeps a non-index serverBuildFile as-is', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(
        reactRouterContext({
          reactRouterConfig: {
            appDirectory: '/project/app',
            buildDirectory: '/project/build',
            serverBuildFile: 'build/server.js',
            basename: '/',
            future: {},
          },
          environmentBuildContext: { name: 'ssr' },
        }),
      )
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      const output = result.build!.rolldownOptions!.output as { chunkFileNames: (c: { name: string }) => string }
      expect(output.chunkFileNames({ name: 'server-build' })).toBe('build/server.js')
    })

    it('manualChunks returns basename when importer includes the server entry point', async () => {
      const plugin = reactRouterHonoServer({ serverEntryPoint: 'app/server.ts' })
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      const output = result.build!.rolldownOptions!.output as {
        manualChunks: (id: string, meta: unknown) => string | undefined
      }
      const meta = {
        getModuleInfo: () => ({ importers: ['app/server.ts'] }),
      }
      expect(output.manualChunks('node_modules/foo/index.ts', meta)).toBe('index')
      // Unrelated importer -> undefined.
      const meta2 = {
        getModuleInfo: () => ({ importers: ['some/other.ts'] }),
      }
      expect(output.manualChunks('node_modules/foo/index.ts', meta2)).toBeUndefined()
    })
  })

  describe('config() — v8 environment API path', () => {
    it('merges into environments.ssr when v8_viteEnvironmentApi is enabled', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(
        reactRouterContext({
          reactRouterConfig: {
            appDirectory: '/project/app',
            buildDirectory: '/project/build',
            serverBuildFile: 'index.js',
            basename: '/',
            future: { v8_viteEnvironmentApi: true },
          },
        }),
      )
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect(result.environments).toBeDefined()
      expect(result.build).toBeUndefined() // not flattened into top-level build.
    })
  })

  describe('findDefaultServerEntry (via config)', () => {
    it('picks app/server.ts when it exists', async () => {
      existsSyncMock.mockImplementation((p: string) => p === 'app/server.ts')
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      // build.rolldownOptions.input should be the resolved entry.
      expect((result.build!.rolldownOptions as { input: string }).input).toBe('app/server.ts')
    })

    it('falls back to app/server/index.ts when the file way is absent', async () => {
      existsSyncMock.mockImplementation((p: string) => p === 'app/server/index.ts')
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect((result.build!.rolldownOptions as { input: string }).input).toBe('app/server/index.ts')
    })

    it('uses the virtual module + warns once when no entry exists', async () => {
      // The `warned` module-level flag is sticky, so reset modules to get a
      // fresh copy and assert the warning is actually emitted to stderr.
      vi.resetModules()
      existsSyncMock.mockReturnValue(false)
      stderrWriteMock.mockClear()
      const { reactRouterHonoServer: freshPlugin } = await import('@/server/infra/hono/dev')
      const plugin = freshPlugin()
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect((result.build!.rolldownOptions as { input: string }).input).toBe(
        '\0virtual:react-router-hono-server/server',
      )
      expect(stderrWriteMock).toHaveBeenCalledTimes(1)
    })

    it('honours an explicit serverEntryPoint option over file discovery', async () => {
      existsSyncMock.mockReturnValue(true) // would otherwise pick app/server.ts
      const plugin = reactRouterHonoServer({ serverEntryPoint: 'custom/server.ts' })
      const cfg = viteUserConfig(reactRouterContext({ environmentBuildContext: { name: 'ssr' } }))
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      const result = (await config(cfg, {} as never)) as UserConfig
      expect((result.build!.rolldownOptions as { input: string }).input).toBe('custom/server.ts')
      expect(existsSyncMock).not.toHaveBeenCalled()
    })
  })

  describe('configureServer()', () => {
    function fakeServer() {
      const middlewares: Array<{ fn: unknown }> = []
      const socket = {
        remoteAddress: '10.0.0.1',
        remotePort: 5555,
        remoteFamily: 'IPv4',
      }
      return {
        server: {
          middlewares: {
            use(fn: unknown) {
              middlewares.push({ fn })
            },
          },
          socket,
          rawHeaders: [] as string[],
        } as unknown,
        middlewares,
        socket,
      }
    }

    it('no-ops (returns early) when pluginConfig is null', async () => {
      const plugin = reactRouterHonoServer()
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      const { server } = fakeServer()
      // No React Router context was set, so pluginConfig is null.
      await configureServer(server)
      expect(honoDevServerMock).not.toHaveBeenCalled()
    })

    it('injects remote-address/port/family headers and wires the hono dev server plugin', async () => {
      // Seed pluginConfig by running config() once with a context.
      const plugin = reactRouterHonoServer({ dev: { exclude: [/^\/custom/] } })
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)

      const honoPlugin = { configureServer: vi.fn() }
      honoDevServerMock.mockReturnValueOnce(honoPlugin)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      const built = fakeServer()
      // attach the socket to the *request* object the middleware sees.
      const req = { socket: built.socket, rawHeaders: [] as string[] }
      await configureServer(built.server)

      // The first middleware pushed is our remote-address injector.
      const injected = built.middlewares[0]!.fn as (req: unknown, _res: unknown, next: () => void) => void
      const next = vi.fn()
      injected(req, undefined, next)
      expect(next).toHaveBeenCalled()
      expect((req as { rawHeaders: string[] }).rawHeaders).toEqual([
        'x-remote-address',
        '10.0.0.1',
        'x-remote-port',
        '5555',
        'x-remote-family',
        'IPv4',
      ])
      expect(honoDevServerMock).toHaveBeenCalled()
      expect(honoPlugin.configureServer).toHaveBeenCalledWith(built.server)
    })

    it('coerces undefined remote address/port/family to "unknown"', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)

      const honoPlugin = { configureServer: vi.fn() }
      honoDevServerMock.mockReturnValueOnce(honoPlugin)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      const built = fakeServer()
      await configureServer(built.server)

      const injected = built.middlewares[0]!.fn as (req: unknown, _res: unknown, next: () => void) => void
      const req = {
        socket: { remoteAddress: undefined, remotePort: undefined, remoteFamily: undefined },
        rawHeaders: [] as string[],
      }
      injected(req, undefined, vi.fn())
      expect((req as { rawHeaders: string[] }).rawHeaders).toEqual([
        'x-remote-address',
        'unknown',
        'x-remote-port',
        'unknown',
        'x-remote-family',
        'unknown',
      ])
    })

    it('does not re-create the hono plugin on a second configureServer call', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)

      const honoPlugin = { configureServer: vi.fn() }
      honoDevServerMock.mockReturnValue(honoPlugin)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      await configureServer(fakeServer().server)
      await configureServer(fakeServer().server)
      expect(honoDevServerMock).toHaveBeenCalledTimes(1)
    })

    it('throws when the hono plugin has no configureServer hook', async () => {
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)

      // Plugin without a configureServer function.
      honoDevServerMock.mockReturnValueOnce({} as never)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      await expect(configureServer(fakeServer().server)).rejects.toThrow(
        'Cannot apply dev server plugin configureServer hook',
      )
      expect(stderrWriteMock).toHaveBeenCalled()
    })
  })

  describe('forceDevMode()', () => {
    it('overwrites NODE_ENV to development when it is not test (via configureServer)', async () => {
      process.env.NODE_ENV = 'production'
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      await configureServer(fakeServerForEnv().server)
      expect(process.env.NODE_ENV).toBe('development')
    })

    it('keeps NODE_ENV as test when already test', async () => {
      process.env.NODE_ENV = 'test'
      const plugin = reactRouterHonoServer()
      const cfg = viteUserConfig(reactRouterContext())
      const config = plugin.config as (config: UserConfig, env: unknown) => Promise<UserConfig | undefined>
      await config(cfg, {} as never)
      const configureServer = plugin.configureServer as (server: unknown) => Promise<void>
      await configureServer(fakeServerForEnv().server)
      expect(process.env.NODE_ENV).toBe('test')
    })
  })
})

function fakeServerForEnv() {
  const middlewares: Array<{ fn: unknown }> = []
  return {
    server: {
      middlewares: {
        use(fn: unknown) {
          middlewares.push({ fn })
        },
      },
      socket: { remoteAddress: '1.1.1.1', remotePort: 1, remoteFamily: 'IPv4' },
      rawHeaders: [],
    } as unknown,
    middlewares,
  }
}

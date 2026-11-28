import type { ConfigEnv, Plugin, PluginOption } from 'vite'

import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { frontEndConfig } from '@kobato/pack/vite/front-end-config'
import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { describe, expect, it } from 'vitest'

const BUILD: ConfigEnv = { command: 'build', mode: 'production', isPreview: false }
const SERVE: ConfigEnv = { command: 'serve', mode: 'development', isPreview: false }
const PREVIEW: ConfigEnv = { command: 'serve', mode: 'production', isPreview: true }

function named(name: string): Plugin {
  return { name }
}

function pluginNames(plugins: PluginOption[]): string[] {
  return plugins.flatMap((entry): string[] => {
    if (Array.isArray(entry)) {
      return pluginNames(entry)
    }
    if (entry instanceof Promise) {
      return []
    }
    return entry ? [entry.name] : []
  })
}

describe('frontEndConfig', () => {
  it('lays the shared plugin list between the application’s own leading and trailing plugins', () => {
    const config = frontEndConfig({
      appDir: 'apps/sayaka',
      port: 4322,
      identityDir: 'apps/sayaka',
      plugins: { leading: [named('leading')], trailing: [named('trailing')] },
    })(SERVE)
    const names = pluginNames(config.plugins ?? [])
    expect(names).toEqual([
      'leading',
      'sanitize-html-engine-alias',
      'inline-package-data',
      'kobato:react-compiler',
      ...pluginNames(reactRouter()),
      ...pluginNames(tailwindcss()),
      'trailing',
    ])
  })

  it('derives the SSR build shape from the command, the server entry, and the externals', () => {
    const spa = frontEndConfig({ appDir: 'apps/kobato', port: 4321 })(BUILD)
    expect(spa.ssr).toEqual({ noExternal: true, target: 'node' })
    expect(spa.environments?.ssr?.build).toBeUndefined()

    const ssr = frontEndConfig({
      appDir: 'apps/sayaka',
      port: 4322,
      identityDir: 'apps/sayaka',
      serverEntry: 'src/server.ts',
      ssrExternals: ['@napi-rs/canvas'],
    })(BUILD)
    expect(ssr.ssr).toEqual({ noExternal: true, target: 'node', external: ['@napi-rs/canvas'] })
    expect(ssr.environments?.ssr?.build).toEqual({ emitAssets: true, rolldownOptions: { input: 'src/server.ts' } })
    expect(ssr.environments?.ssr?.resolve).toEqual({ conditions: ['node'] })

    const dev = frontEndConfig({
      appDir: 'apps/sayaka',
      port: 4322,
      identityDir: 'apps/sayaka',
      serverEntry: 'src/server.ts',
    })(SERVE)
    expect(dev.ssr).toBeUndefined()
    expect(dev.environments?.ssr?.build).toBeUndefined()
    expect(dev.environments?.ssr?.resolve).toEqual({ conditions: ['node'] })
  })

  it('takes the __APP_*__ identity from identityDir, defaulting to the backend that embeds the workspace', () => {
    const workspace = frontEndConfig({ appDir: 'apps/kobato', port: 4321 })(SERVE)
    expect(workspace.define).toEqual(appDefines(readAppPackage('apps/kobato')))
    const sayaka = frontEndConfig({ appDir: 'apps/sayaka', port: 4322, identityDir: 'apps/sayaka' })(SERVE)
    expect(sayaka.define).toEqual(appDefines(readAppPackage('apps/sayaka')))
  })

  it('keeps the port, the route warmup files, and the limits while the application adds its own rules', () => {
    const proxyRule = { target: 'http://127.0.0.1:4320', changeOrigin: true }
    const config = frontEndConfig({
      appDir: 'apps/kobato',
      port: 4321,
      base: ({ isPreview }) => (isPreview ? '/' : '/admin/'),
      optimizeDeps: true,
      server: { host: '127.0.0.1', proxy: { '/rpc': proxyRule } },
    })
    expect(config(SERVE).base).toBe('/admin/')
    expect(config(PREVIEW).base).toBe('/')
    expect(config(BUILD).base).toBe('/admin/')

    const served = config(SERVE)
    expect(served.server).toEqual({
      warmup: { clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'] },
      host: '127.0.0.1',
      proxy: { '/rpc': proxyRule },
      port: 4321,
    })
    expect(served.optimizeDeps).toEqual(appOptimizeDeps('apps/kobato'))
    expect(served.resolve).toEqual({ tsconfigPaths: true })
    expect(served.build).toEqual({ emptyOutDir: true, chunkSizeWarningLimit: 500 })
    expect(served.environments?.client?.build).toEqual({ chunkSizeWarningLimit: 2500 })

    const bare = frontEndConfig({ appDir: 'apps/sayaka', port: 4322, identityDir: 'apps/sayaka' })(SERVE)
    expect(bare.optimizeDeps).toBeUndefined()
    expect(bare.base).toBeUndefined()
    expect(bare.server?.port).toBe(4322)
    expect(bare.server?.host).toBeUndefined()
  })
})

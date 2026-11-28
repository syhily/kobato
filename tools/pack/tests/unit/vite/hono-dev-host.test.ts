import { honoDevHost, withoutViteConfigFlag } from '@kobato/pack/vite/hono-dev-host'
import { parseConfigArg } from '@kobato/server/infra/config-arg'
import { __resetDevHostStateForTests, devHostState } from '@kobato/server/infra/dev-host-state'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const PROBE = 'kobatoDevHostProbe'
const VITE_DEV_SERVER_SLOT = Symbol.for('kobato.vite-dev-server')

let root: string
let previousNodeEnv: string | undefined
let previousArgv: string[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kobato-dev-host-'))
  mkdirSync(join(root, 'src'))
  previousNodeEnv = process.env.NODE_ENV
  previousArgv = [...process.argv]
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  process.argv = previousArgv
  Reflect.deleteProperty(globalThis, PROBE)
  Reflect.deleteProperty(globalThis, VITE_DEV_SERVER_SLOT)
  __resetDevHostStateForTests()
  if (previousNodeEnv === undefined) {
    Reflect.deleteProperty(process.env, 'NODE_ENV')
  } else {
    process.env.NODE_ENV = previousNodeEnv
  }
})

describe('honoDevHost', () => {
  it('marks the process as a dev host before the entry evaluates, strips the Vite config flag the server would misread, and the entry sees no import.meta.hot', async () => {
    expect(devHostState()).toBeUndefined()
    process.argv = [
      process.execPath,
      'vite',
      'apps/kobato',
      '--config',
      'apps/kobato/vite.backend.config.ts',
      '--port',
      '4320',
    ]
    writeFileSync(
      join(root, 'src/server.ts'),
      [
        "Reflect.set(globalThis, 'kobatoDevHostProbe', {",
        "  marked: Reflect.get(globalThis, Symbol.for('kobato.server.dev-host')) === true,",
        '  hot: import.meta.hot,',
        '  argv: process.argv.slice(2),',
        '})',
        "export default { fetch: () => new Response('ok') }",
      ].join('\n'),
    )

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [honoDevHost({ entry: 'src/server.ts' })],
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    try {
      const entry = await server.ssrLoadModule('src/server.ts')
      const probe = Reflect.get(globalThis, PROBE) as { marked: boolean; hot: unknown; argv: string[] }

      expect(probe.marked).toBe(true)
      expect(probe.hot).toBeUndefined()
      expect(
        probe.argv,
        "Vite's --config names the Vite config; the kobato server reads the same flag for kobato.config.json, so the dev host " +
          'drops it before the entry evaluates and leaves every other Vite flag in place',
      ).toEqual(['apps/kobato', '--port', '4320'])
      expect(devHostState(), 'the server-side reader sees the marker the plugin set').toBeDefined()
      expect(await (entry.default.fetch() as Response).text()).toBe('ok')
      expect(
        Reflect.get(globalThis, VITE_DEV_SERVER_SLOT),
        'exposeViteDevServer published the dev server',
      ).toBeDefined()
    } finally {
      await server.close()
    }
  }, 30_000)

  it('drops every spelling of the Vite config flag and nothing else', () => {
    expect(
      withoutViteConfigFlag(['node', 'vite', '--config=x.ts', '-c', 'y.ts', '--port', '1', '--strictPort']),
    ).toEqual(['node', 'vite', '--port', '1', '--strictPort'])
    expect(withoutViteConfigFlag(['node', 'vite', '--config'])).toEqual(['node', 'vite'])
  })

  it('stays in lockstep with the server config-arg reader: no spelling it reads survives the strip', () => {
    const spellings = [
      ['node', 'vite', 'apps/kobato', '--config', 'vite.backend.config.ts'],
      ['node', 'vite', 'apps/kobato', '--config=vite.backend.config.ts'],
      ['node', 'vite', 'apps/kobato', '-c', 'vite.backend.config.ts'],
    ]
    for (const argv of spellings) {
      expect(parseConfigArg(argv), `${argv.join(' ')} is a spelling the server reads`).toBeDefined()
      expect(parseConfigArg(withoutViteConfigFlag(argv)), `${argv.join(' ')} must not reach the server`).toBeUndefined()
    }
  })
})

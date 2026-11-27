import { honoDevHost } from '@kobato/pack/vite/hono-dev-host'
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

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kobato-dev-host-'))
  mkdirSync(join(root, 'src'))
  previousNodeEnv = process.env.NODE_ENV
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
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
  it('marks the process as a dev host before the entry module evaluates, and the entry sees no import.meta.hot', async () => {
    expect(devHostState()).toBeUndefined()
    writeFileSync(
      join(root, 'src/server.ts'),
      [
        "Reflect.set(globalThis, 'kobatoDevHostProbe', {",
        "  marked: Reflect.get(globalThis, Symbol.for('kobato.server.dev-host')) === true,",
        '  hot: import.meta.hot,',
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
      const probe = Reflect.get(globalThis, PROBE) as { marked: boolean; hot: unknown }

      expect(probe.marked).toBe(true)
      expect(probe.hot).toBeUndefined()
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
})

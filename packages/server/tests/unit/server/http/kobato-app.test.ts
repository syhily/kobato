import type { ServerType } from '@hono/node-server'
import type { AddressInfo } from 'node:net'

import { serverConfig } from '@kobato/server/infra/config'
import { root } from '@kobato/server/infra/logger'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(),
}))

vi.mock('@kobato/server/http/middleware-pipeline', () => ({
  configureMiddleware: vi.fn(),
}))

const { serve } = await import('@hono/node-server')
const { configureMiddleware } = await import('@kobato/server/http/middleware-pipeline')
const { createKobatoApp, listenKobato } = await import('@kobato/server/http/kobato-app')
const { restartServer, setRestartApp } = await import('@kobato/server/infra/lifecycle')

const serveMock = vi.mocked(serve)
const configureMiddlewareMock = vi.mocked(configureMiddleware)

const SHELL_HTML = '<html><head><script>void 0</script></head><body><div id="root"></div></body></html>'
const ASSET_NAME = 'entry-abc123.js'

const assetsRoot = mkdtempSync(join(tmpdir(), 'kobato-app-unit-'))
writeFileSync(join(assetsRoot, 'index.html'), SHELL_HTML)
mkdirSync(join(assetsRoot, 'assets'))
writeFileSync(join(assetsRoot, 'assets', ASSET_NAME), 'export const ready = true')

afterAll(() => {
  rmSync(assetsRoot, { recursive: true, force: true })
})

function nonceFromCsp(csp: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(csp ?? '')?.[1]
}

describe('createKobatoApp', () => {
  beforeEach(() => {
    configureMiddlewareMock.mockReset()
    vi.stubEnv('DEV', false as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs the middleware pipeline over the app it hands back', async () => {
    const app = createKobatoApp(assetsRoot)

    expect(configureMiddlewareMock).toHaveBeenCalledTimes(1)
    expect(configureMiddlewareMock.mock.calls[0]![0]).toBe(app)

    const res = await app.request('/admin/signin')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const nonce = nonceFromCsp(res.headers.get('Content-Security-Policy'))
    expect(nonce).toBeDefined()
    expect(await res.text()).toBe(SHELL_HTML.replace('<script>', `<script nonce="${nonce}">`))
  })

  it('mounts the workspace assets, the workspace documents, and the final 404', async () => {
    const app = createKobatoApp(assetsRoot)

    const asset = await app.request(`/admin/assets/${ASSET_NAME}`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('Cache-Control')).toBe('public, max-age=31536000')
    expect(await asset.text()).toBe('export const ready = true')

    for (const path of ['/admin', '/admin/posts', '/editor/post/new']) {
      expect((await app.request(path)).status, path).toBe(200)
    }
    for (const path of ['/', '/archives', '/assets/x.js', '/admin/assets/missing.js']) {
      expect((await app.request(path)).status, path).toBe(404)
    }
    expect((await app.request('/admin', { method: 'POST' })).status).toBe(404)
  })
})

describe('listenKobato', () => {
  const fakeServer = { id: 'listening-server' }

  beforeEach(() => {
    serveMock.mockReset()
    serveMock.mockReturnValue(fakeServer as unknown as ServerType)
  })

  it('binds the configured host and port to the app fetch handler without touching the global objects', async () => {
    const app = createKobatoApp(assetsRoot)

    expect(listenKobato(app)).toBe(fakeServer)

    expect(serveMock).toHaveBeenCalledTimes(1)
    const [options] = serveMock.mock.calls[0]!
    expect(options.port).toBe(serverConfig.server.port)
    expect(options.hostname).toBe(serverConfig.server.host)
    expect(options.overrideGlobalObjects).toBe(false)
    const fetchHandler = options.fetch as (request: Request) => Promise<Response>
    const res = await fetchHandler(new Request('http://127.0.0.1/nowhere'))
    expect(res.status).toBe(404)
  })

  it('announces the backend start and the local URL once the socket listens', () => {
    const infoSpy = vi.spyOn(root, 'info').mockImplementation(() => undefined)
    try {
      listenKobato(createKobatoApp(assetsRoot))

      const onListening = serveMock.mock.calls[0]![1]!
      onListening({ address: '127.0.0.1', family: 'IPv4', port: 4321 } as AddressInfo)

      expect(infoSpy).toHaveBeenCalledWith({ port: 4321 }, '🚀 Backend server started')
      expect(infoSpy).toHaveBeenCalledWith({ url: 'http://127.0.0.1:4321' }, '🌍 Local server URL')
    } finally {
      infoSpy.mockRestore()
    }
  })

  it('serves a cold boot and a restart through the same listener options', async () => {
    const app = createKobatoApp(assetsRoot)
    listenKobato(app)
    setRestartApp(app)
    await restartServer()

    expect(serveMock).toHaveBeenCalledTimes(2)
    const { fetch: coldBootFetch, ...coldBootOptions } = serveMock.mock.calls[0]![0]
    const { fetch: restartFetch, ...restartOptions } = serveMock.mock.calls[1]![0]
    expect(coldBootOptions).toEqual({
      port: serverConfig.server.port,
      hostname: serverConfig.server.host,
      overrideGlobalObjects: false,
    })
    expect(restartOptions).toEqual(coldBootOptions)
    for (const fetchHandler of [coldBootFetch, restartFetch]) {
      const res = await (fetchHandler as (request: Request) => Promise<Response>)(
        new Request('http://127.0.0.1/nowhere'),
      )
      expect(res.status).toBe(404)
    }
  })
})

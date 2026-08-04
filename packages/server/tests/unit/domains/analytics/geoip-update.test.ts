import { DomainError } from '@kobato/server/infra/http/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_PATH = '/tmp/maxmind/GeoLite2-City.mmdb'
const META_PATH = '/tmp/maxmind/GeoLite2-City.meta.json'

// Per-test knobs read by the mocked modules below. `vi.resetModules()` in
// beforeEach gives every test a fresh module graph (and a fresh inflight
// slot), so rebinding these knobs per test is safe.
const knobs = vi.hoisted(() => ({
  installed: true,
  metaJson: null as string | null,
}))

const fsPromiseMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

const resetGeoReader = vi.hoisted(() => vi.fn())
const readerOpen = vi.hoisted(() => vi.fn())
const pipelineMock = vi.hoisted(() => vi.fn())

function mockModules() {
  vi.doMock('@kobato/server/infra/paths', () => ({
    MAXMIND_DB_PATH: DB_PATH,
    MAXMIND_META_PATH: META_PATH,
  }))
  vi.doMock('@kobato/server/domains/analytics/geoip', () => ({ resetGeoReader }))
  vi.doMock('@kobato/server/infra/logger', () => ({
    getLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }))
  vi.doMock('@maxmind/geoip2-node', () => ({ Reader: { open: readerOpen } }))
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return { ...actual, existsSync: () => knobs.installed, createWriteStream: vi.fn() }
  })
  vi.doMock('node:fs/promises', () => ({
    ...fsPromiseMocks,
    readFile: vi.fn(async () => {
      if (knobs.metaJson === null) {
        throw new Error('ENOENT')
      }
      return knobs.metaJson
    }),
  }))
  vi.doMock('node:stream/promises', () => ({ pipeline: pipelineMock }))
}

function meta(meta: { version: string | null; source: 'upload' | 'remote' }): string {
  return JSON.stringify({ ...meta, updatedAt: '2026-08-01T00:00:00.000Z' })
}

function versionResponse(version: string): Response {
  return new Response(JSON.stringify({ version }), { status: 200 })
}

function downloadResponse(): Response {
  return new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 })
}

// The production timeout object: AbortSignal.timeout's reason is a real
// TimeoutError DOMException, and isTimeoutError relies on
// `instanceof Error` — stubbing with the genuine shape (not an Error
// with a patched name) proves the guard accepts what undici/v8 actually
// throws.
function timeoutError(): DOMException {
  return new DOMException('The operation timed out.', 'TimeoutError')
}

describe('analytics/geoip-update', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    knobs.installed = true
    knobs.metaJson = null
    pipelineMock.mockResolvedValue(undefined)
    readerOpen.mockReset()
    readerOpen.mockResolvedValue({})
    mockModules()
  })

  describe('fetchLatestGeoipVersion', () => {
    it('parses the version from the jsDelivr package.json', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionResponse('1.0.86')))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip-update')
      await expect(fetchLatestGeoipVersion()).resolves.toBe('1.0.86')
      expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://cdn.jsdelivr.net/npm/geolite2-city/package.json')
    })

    it('throws a DomainError when the registry answers an error status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip-update')
      await expect(fetchLatestGeoipVersion()).rejects.toMatchObject({ name: 'DomainError', code: 'INTERNAL' })
    })

    it('reports a timeout distinctly from a connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip-update')
      await expect(fetchLatestGeoipVersion()).rejects.toMatchObject({
        name: 'DomainError',
        message: 'GeoIP 版本检测超时，请稍后再试',
      })
    })
  })

  describe('runRemoteGeoipUpdate', () => {
    it('reports up-to-date when the installed version matches the remote one', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionResponse('1.0.86')))
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      const result = await runRemoteGeoipUpdate()
      expect(result).toEqual({ status: 'up-to-date', version: '1.0.86', previousVersion: '1.0.86' })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fsPromiseMocks.rename).not.toHaveBeenCalled()
    })

    it('downloads, validates, and swaps the database when the version differs', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      const result = await runRemoteGeoipUpdate()
      expect(result).toEqual({ status: 'updated', version: '1.0.87', previousVersion: '1.0.86' })
      expect(vi.mocked(fetch).mock.calls[1]![0]).toBe(
        'https://cdn.jsdelivr.net/npm/geolite2-city@1.0.87/GeoLite2-City.mmdb.gz',
      )
      // The staged file is validated by the reader before the swap.
      expect(readerOpen).toHaveBeenCalledWith(`${DB_PATH}.download`)
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(`${DB_PATH}.download`, DB_PATH)
      expect(fsPromiseMocks.writeFile).toHaveBeenCalledWith(META_PATH, expect.stringContaining('"source":"remote"'))
      expect(fsPromiseMocks.writeFile).toHaveBeenCalledWith(META_PATH, expect.stringContaining('"1.0.87"'))
      expect(resetGeoReader).toHaveBeenCalled()
    })

    it('downloads when no database is installed yet', async () => {
      knobs.installed = false
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      const result = await runRemoteGeoipUpdate()
      expect(result.status).toBe('updated')
      expect(result.previousVersion).toBeNull()
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(`${DB_PATH}.download`, DB_PATH)
    })

    it('drops the staged file and never swaps when validation fails', async () => {
      readerOpen.mockRejectedValue(new Error('invalid database'))
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({ name: 'DomainError', code: 'INTERNAL' })
      expect(fsPromiseMocks.rename).not.toHaveBeenCalled()
      expect(fsPromiseMocks.rm).toHaveBeenCalledWith(`${DB_PATH}.download`, { force: true })
      expect(resetGeoReader).not.toHaveBeenCalled()
    })

    it('reports a download timeout distinctly from a connection failure', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockRejectedValueOnce(timeoutError()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({
        name: 'DomainError',
        message: 'GeoIP 数据库下载超时，请稍后再试',
      })
    })

    it('reports a download timeout that fires mid-stream', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      pipelineMock.mockRejectedValueOnce(timeoutError())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({
        name: 'DomainError',
        message: 'GeoIP 数据库下载超时，请稍后再试',
      })
      // The staged file is still cleaned up.
      expect(fsPromiseMocks.rm).toHaveBeenCalledWith(`${DB_PATH}.download`, { force: true })
    })

    it('propagates the size-guard DomainError from the stream and cleans the staged file', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      // The gzip-bomb guard throws a DomainError inside the pipeline
      // generator; it must flow out unmodified (no timeout translation)
      // and the staged file must be dropped.
      const sizeError = new DomainError('INTERNAL', 'GeoIP 数据库超过 100 MB 大小限制')
      pipelineMock.mockRejectedValueOnce(sizeError)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await expect(runRemoteGeoipUpdate()).rejects.toBe(sizeError)
      expect(fsPromiseMocks.rm).toHaveBeenCalledWith(`${DB_PATH}.download`, { force: true })
      expect(fsPromiseMocks.rename).not.toHaveBeenCalled()
    })

    it('still succeeds when the meta sidecar write fails after the swap', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      fsPromiseMocks.writeFile.mockRejectedValueOnce(new Error('ENOSPC'))
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      // The database swap is a fact — a sidecar failure degrades to a
      // warning instead of failing the operation.
      const result = await runRemoteGeoipUpdate()
      expect(result.status).toBe('updated')
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(`${DB_PATH}.download`, DB_PATH)
      expect(resetGeoReader).toHaveBeenCalled()
    })

    it('coalesces concurrent manual checks into a single download', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      const [a, b] = await Promise.all([runRemoteGeoipUpdate(), runRemoteGeoipUpdate()])
      expect(a).toBe(b)
      expect(a.status).toBe('updated')
      // One version check + one download, not two of each.
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fsPromiseMocks.rename).toHaveBeenCalledTimes(1)
    })
  })

  describe('runScheduledGeoipUpdate', () => {
    it('never replaces a manually uploaded database', async () => {
      knobs.metaJson = meta({ version: null, source: 'upload' })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await runScheduledGeoipUpdate()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('updates a remote-installed database when a newer version exists', async () => {
      knobs.metaJson = meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await runScheduledGeoipUpdate()
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(`${DB_PATH}.download`, DB_PATH)
    })

    it('installs a database when none exists', async () => {
      knobs.installed = false
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip-update')

      await runScheduledGeoipUpdate()
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(`${DB_PATH}.download`, DB_PATH)
    })
  })
})

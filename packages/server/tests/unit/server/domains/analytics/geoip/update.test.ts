import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@kobato/server/infra/data-paths.ts'
import { minimalMmdbBytes } from '@kobato/server/tests/utils/minimal-mmdb.ts'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MMDB = minimalMmdbBytes()

function meta(metaJson: { version: string | null; source: 'upload' | 'remote' }): void {
  writeFileSync(MAXMIND_META_PATH, JSON.stringify({ ...metaJson, updatedAt: '2026-08-01T00:00:00.000Z' }))
}

function versionResponse(version: string): Response {
  return new Response(JSON.stringify({ version }), { status: 200 })
}

function downloadResponse(bytes: Buffer = MMDB): Response {
  return new Response(new Uint8Array(gzipSync(bytes)), { status: 200 })
}

// AbortSignal.timeout's reason is a real TimeoutError DOMException, which isTimeoutError's instanceof Error check expects.
function timeoutError(): DOMException {
  return new DOMException('The operation timed out.', 'TimeoutError')
}

beforeEach(() => {
  vi.unstubAllGlobals()
  mkdirSync(dirname(MAXMIND_DB_PATH), { recursive: true })
  rmSync(MAXMIND_DB_PATH, { force: true })
  rmSync(`${MAXMIND_DB_PATH}.download`, { force: true })
  rmSync(MAXMIND_META_PATH, { force: true, recursive: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(MAXMIND_META_PATH, { force: true, recursive: true })
  rmSync(`${MAXMIND_DB_PATH}.download`, { force: true })
})

describe('analytics/geoip-update', () => {
  describe('fetchLatestGeoipVersion', () => {
    it('parses the version from the jsDelivr package.json', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionResponse('1.0.86')))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip/update.ts')
      await expect(fetchLatestGeoipVersion()).resolves.toBe('1.0.86')
      expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://cdn.jsdelivr.net/npm/geolite2-city/package.json')
    })

    it('throws a DomainError when the registry answers an error status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip/update.ts')
      await expect(fetchLatestGeoipVersion()).rejects.toMatchObject({ name: 'DomainError', code: 'INTERNAL' })
    })

    it('reports a timeout distinctly from a connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()))
      const { fetchLatestGeoipVersion } = await import('@kobato/server/domains/analytics/geoip/update.ts')
      await expect(fetchLatestGeoipVersion()).rejects.toMatchObject({
        name: 'DomainError',
        descriptor: { messageKey: 'analytics.error.geoipVersionTimeout' },
      })
    })
  })

  describe('runRemoteGeoipUpdate', () => {
    it('reports up-to-date when the installed version matches the remote one', async () => {
      writeFileSync(MAXMIND_DB_PATH, MMDB)
      meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(versionResponse('1.0.86')))
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      const result = await runRemoteGeoipUpdate()
      expect(result).toEqual({ status: 'up-to-date', version: '1.0.86', previousVersion: '1.0.86' })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })

    it('downloads, validates, and swaps the database when the version differs', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      const result = await runRemoteGeoipUpdate()
      expect(result).toEqual({ status: 'updated', version: '1.0.87', previousVersion: '1.0.86' })
      expect(vi.mocked(fetch).mock.calls[1]![0]).toBe(
        'https://cdn.jsdelivr.net/npm/geolite2-city@1.0.87/GeoLite2-City.mmdb.gz',
      )
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
      expect(existsSync(`${MAXMIND_DB_PATH}.download`)).toBe(false)
      const storedMeta = JSON.parse(readFileSync(MAXMIND_META_PATH, 'utf8')) as { version: string; source: string }
      expect(storedMeta.source).toBe('remote')
      expect(storedMeta.version).toBe('1.0.87')
    })

    it('downloads when no database is installed yet', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      const result = await runRemoteGeoipUpdate()
      expect(result.status).toBe('updated')
      expect(result.previousVersion).toBeNull()
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })

    it('drops the staged file and never swaps when validation fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(versionResponse('1.0.87'))
          .mockResolvedValueOnce(downloadResponse(Buffer.from('this is not an mmdb'))),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({ name: 'DomainError', code: 'INTERNAL' })
      expect(existsSync(MAXMIND_DB_PATH)).toBe(false)
      expect(existsSync(`${MAXMIND_DB_PATH}.download`)).toBe(false)
    })

    it('reports a download timeout distinctly from a connection failure', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockRejectedValueOnce(timeoutError()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({
        name: 'DomainError',
        descriptor: { messageKey: 'analytics.error.geoipDownloadTimeout' },
      })
    })

    it('reports a download timeout that fires mid-stream', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      const firstChunk = gzipSync(MMDB)
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(versionResponse('1.0.87'))
          .mockResolvedValueOnce(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(firstChunk))
                  controller.error(timeoutError())
                },
              }),
              { status: 200 },
            ),
          ),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({
        name: 'DomainError',
        descriptor: { messageKey: 'analytics.error.geoipDownloadTimeout' },
      })
      expect(existsSync(`${MAXMIND_DB_PATH}.download`)).toBe(false)
    })

    it('propagates the size-guard DomainError from the stream and cleans the staged file', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      // 101 MB of zeroes gzip down to ~100 KB but decompress past the 100 MB guard.
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(versionResponse('1.0.87'))
          .mockResolvedValueOnce(downloadResponse(Buffer.alloc(101 * 1024 * 1024))),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await expect(runRemoteGeoipUpdate()).rejects.toMatchObject({
        descriptor: { messageKey: 'analytics.error.geoipTooLarge' },
      })
      expect(existsSync(`${MAXMIND_DB_PATH}.download`)).toBe(false)
      expect(existsSync(MAXMIND_DB_PATH)).toBe(false)
    }, 30_000)

    it('still succeeds when the meta sidecar write fails after the swap', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      rmSync(MAXMIND_META_PATH, { force: true })
      // A directory at the sidecar path makes the post-swap write fail for real.
      mkdirSync(MAXMIND_META_PATH)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      const result = await runRemoteGeoipUpdate()
      expect(result.status).toBe('updated')
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })

    it('coalesces concurrent manual checks into a single download', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runRemoteGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      const [a, b] = await Promise.all([runRemoteGeoipUpdate(), runRemoteGeoipUpdate()])
      expect(a).toBe(b)
      expect(a.status).toBe('updated')
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })
  })

  describe('runScheduledGeoipUpdate', () => {
    it('never replaces a manually uploaded database', async () => {
      writeFileSync(MAXMIND_DB_PATH, MMDB)
      meta({ version: null, source: 'upload' })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await runScheduledGeoipUpdate()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('updates a remote-installed database when a newer version exists', async () => {
      meta({ version: '1.0.86', source: 'remote' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await runScheduledGeoipUpdate()
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })

    it('installs a database when none exists', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(versionResponse('1.0.87')).mockResolvedValueOnce(downloadResponse()),
      )
      const { runScheduledGeoipUpdate } = await import('@kobato/server/domains/analytics/geoip/update.ts')

      await runScheduledGeoipUpdate()
      expect(readFileSync(MAXMIND_DB_PATH).equals(MMDB)).toBe(true)
    })
  })
})

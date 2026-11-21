// GeoLite2-City from the `geolite2-city` npm package mirrored on jsDelivr
// (CC-BY-NC-SA-4.0 / MaxMind GeoLite2 EULA, attribution required). Installed
// state lives in a JSON sidecar next to the database file.

import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { resetGeoReader } from '@kobato/server/domains/analytics/geoip/lookup'
import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@kobato/server/infra/data-paths'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { Reader } from '@maxmind/geoip2-node'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { z } from 'zod'

const log = getLogger('analytics.geoip-update')

const GEOIP_PACKAGE = 'geolite2-city'
const GEOIP_VERSION_URL = `https://cdn.jsdelivr.net/npm/${GEOIP_PACKAGE}/package.json`
const VERSION_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
const MAX_DB_BYTES = 100 * 1024 * 1024

function geoipDownloadUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/${GEOIP_PACKAGE}@${version}/GeoLite2-City.mmdb.gz`
}

let writeChain: Promise<void> = Promise.resolve()

export function withGeoipWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn, fn)
  writeChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export interface GeoipDbMeta {
  version: string | null
  source: 'upload' | 'remote'
  updatedAt: string
}

const metaSchema = z.object({
  version: z.string().nullable(),
  source: z.enum(['upload', 'remote']),
  updatedAt: z.string(),
})

export async function readGeoipMeta(): Promise<GeoipDbMeta | null> {
  try {
    const parsed = metaSchema.safeParse(JSON.parse(await readFile(MAXMIND_META_PATH, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function writeGeoipMeta(meta: GeoipDbMeta): Promise<void> {
  await mkdir(path.dirname(MAXMIND_META_PATH), { recursive: true })
  await writeFile(MAXMIND_META_PATH, JSON.stringify(meta))
}

export async function writeGeoipMetaBestEffort(meta: GeoipDbMeta): Promise<void> {
  try {
    await writeGeoipMeta(meta)
  } catch (err) {
    log.warn('GeoIP meta write failed after database install', {
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

export interface GeoipDbStatus {
  installed: boolean
  version: string | null
  source: 'upload' | 'remote' | null
  updatedAt: string | null
}

export async function getGeoipDbStatus(): Promise<GeoipDbStatus> {
  const meta = await readGeoipMeta()
  return {
    installed: existsSync(MAXMIND_DB_PATH),
    version: meta?.version ?? null,
    source: meta?.source ?? null,
    updatedAt: meta?.updatedAt ?? null,
  }
}

const packageSchema = z.object({ version: z.string().min(1) })

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === 'TimeoutError'
}

export async function fetchLatestGeoipVersion(): Promise<string> {
  let res: Response
  try {
    res = await fetch(GEOIP_VERSION_URL, { signal: AbortSignal.timeout(VERSION_TIMEOUT_MS) })
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipVersionTimeout'))
    }
    throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipVersionConnect'))
  }
  if (!res.ok) {
    throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipVersionStatus', { status: res.status }))
  }
  const parsed = packageSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) {
    throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipVersionInvalid'))
  }
  return parsed.data.version
}

async function installRemoteDb(version: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(geoipDownloadUrl(version), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipDownloadTimeout'))
    }
    throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipDownloadConnect'))
  }
  if (!res.ok || res.body === null) {
    throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipDownloadStatus', { status: res.status }))
  }

  await mkdir(path.dirname(MAXMIND_DB_PATH), { recursive: true })
  const tmpPath = `${MAXMIND_DB_PATH}.download`
  let received = 0
  try {
    await pipeline(
      Readable.fromWeb(unsafeCast<WebReadableStream>(res.body)),
      createGunzip(),
      async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          received += chunk.byteLength
          if (received > MAX_DB_BYTES) {
            throw new DomainError(
              'INTERNAL',
              descriptorFor('analytics.error.geoipTooLarge', { max: `${MAX_DB_BYTES / (1024 * 1024)} MB` }),
            )
          }
          yield chunk
        }
      },
      createWriteStream(tmpPath),
    )
    try {
      await Reader.open(tmpPath)
    } catch {
      throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipInvalid'))
    }
    await rename(tmpPath, MAXMIND_DB_PATH)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    if (isTimeoutError(err)) {
      throw new DomainError('INTERNAL', descriptorFor('analytics.error.geoipDownloadTimeout'))
    }
    throw err
  }

  resetGeoReader()
  await writeGeoipMetaBestEffort({ version, source: 'remote', updatedAt: new Date().toISOString() })
}

export interface GeoipUpdateResult {
  status: 'updated' | 'up-to-date'
  version: string
  previousVersion: string | null
}

async function checkAndInstallRemote(): Promise<GeoipUpdateResult> {
  const latest = await fetchLatestGeoipVersion()
  const installed = existsSync(MAXMIND_DB_PATH)
  const previousMeta = await readGeoipMeta()
  const previousVersion = previousMeta?.version ?? null

  if (installed && previousVersion === latest) {
    return { status: 'up-to-date', version: latest, previousVersion }
  }

  await installRemoteDb(latest)
  log.info('GeoIP database installed from remote', {
    fromVersion: previousVersion,
    toVersion: latest,
    path: MAXMIND_DB_PATH,
  })
  return { status: 'updated', version: latest, previousVersion }
}

let inflight: Promise<GeoipUpdateResult> | null = null

export function runRemoteGeoipUpdate(): Promise<GeoipUpdateResult> {
  inflight ??= withGeoipWriteLock(checkAndInstallRemote).finally(() => {
    inflight = null
  })
  return inflight
}

export async function runScheduledGeoipUpdate(): Promise<void> {
  await withGeoipWriteLock(async () => {
    if (existsSync(MAXMIND_DB_PATH)) {
      const meta = await readGeoipMeta()
      if (meta?.source !== 'remote') {
        log.debug('GeoIP auto-update skipped; database was installed manually')
        return
      }
    }
    await checkAndInstallRemote()
  })
}

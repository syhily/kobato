// GeoLite2-City, fetched from the `geolite2-city` npm package mirrored
// on jsDelivr (CC-BY-NC-SA-4.0 / MaxMind GeoLite2 EULA, attribution
// required). Installed state lives in a JSON sidecar next to the
// database file; the auto-update never replaces a manual upload.

import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { Reader } from '@maxmind/geoip2-node'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { z } from 'zod'

import { resetGeoReader } from '@/server/domains/analytics/geoip'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@/server/infra/paths'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('analytics.geoip-update')

const GEOIP_PACKAGE = 'geolite2-city'
const GEOIP_VERSION_URL = `https://cdn.jsdelivr.net/npm/${GEOIP_PACKAGE}/package.json`
const VERSION_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
// Same ceiling as the manual upload endpoint (100 MiB), measured on DECOMPRESSED bytes.
const MAX_DB_BYTES = 100 * 1024 * 1024

function geoipDownloadUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/${GEOIP_PACKAGE}@${version}/GeoLite2-City.mmdb.gz`
}

// Both writers of the database/meta pair (remote install + upload
// endpoint) serialize on this promise chain so the file and its sidecar
// never describe different installs.
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
  /** npm package version; `null` for manual uploads (unknown provenance). */
  version: string | null
  source: 'upload' | 'remote'
  /** ISO timestamp of the install. */
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

/**
 * Best-effort meta write for callers that have already swapped the
 * database; the sidecar only feeds status and the provenance guard.
 */
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
      throw new DomainError('INTERNAL', 'GeoIP 版本检测超时，请稍后再试')
    }
    throw new DomainError('INTERNAL', '无法连接 GeoIP 更新源，请检查网络后重试')
  }
  if (!res.ok) {
    throw new DomainError('INTERNAL', `GeoIP 版本检测失败（HTTP ${res.status}）`)
  }
  const parsed = packageSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) {
    throw new DomainError('INTERNAL', 'GeoIP 更新源返回了无效的版本信息')
  }
  return parsed.data.version
}

async function installRemoteDb(version: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(geoipDownloadUrl(version), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new DomainError('INTERNAL', 'GeoIP 数据库下载超时，请稍后再试')
    }
    throw new DomainError('INTERNAL', '无法连接 GeoIP 下载源，请检查网络后重试')
  }
  if (!res.ok || res.body === null) {
    throw new DomainError('INTERNAL', `下载 GeoIP 数据库失败（HTTP ${res.status}）`)
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
            // DomainError, not a bare Error — the oRPC guard would
            // otherwise surface a generic 500 instead of the size message.
            throw new DomainError('INTERNAL', 'GeoIP 数据库超过 100 MB 大小限制')
          }
          yield chunk
        }
      },
      createWriteStream(tmpPath),
    )
    // Validate before the swap — a corrupt download must never replace a working database.
    try {
      await Reader.open(tmpPath)
    } catch {
      throw new DomainError('INTERNAL', '下载的 GeoIP 数据库无效，已中止')
    }
    await rename(tmpPath, MAXMIND_DB_PATH)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    if (isTimeoutError(err)) {
      // An abort mid-stream rejects `pipeline()` instead of the fetch
      // await — same TimeoutError, translated here.
      throw new DomainError('INTERNAL', 'GeoIP 数据库下载超时，请稍后再试')
    }
    throw err
  }

  // The swap is done — refresh the reader even if the sidecar write fails.
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

// Concurrent manual checks coalesce on one module-level flight; the
// write lock serializes everything else.
let inflight: Promise<GeoipUpdateResult> | null = null

/** Manual check-and-update: downloads whenever the remote version differs. */
export function runRemoteGeoipUpdate(): Promise<GeoipUpdateResult> {
  inflight ??= withGeoipWriteLock(checkAndInstallRemote).finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * Scheduled auto-update: maintains databases it installed itself (and
 * installs one when none exists), never replaces a manual upload.
 * The provenance check runs INSIDE the write lock.
 */
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

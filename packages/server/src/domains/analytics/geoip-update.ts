// Remote GeoLite2-City distribution: the `geolite2-city` npm package
// (maintained by wp-statistics/VeronaLabs, licensed CC-BY-NC-SA-4.0)
// mirrored on jsDelivr — an unofficial redistribution of MaxMind's
// GeoLite2-City database, which itself ships under the MaxMind GeoLite2
// EULA (attribution required). Chosen because MaxMind's official download
// has required an account license key since 2019-12; deployments with
// commercial-use obligations should license the database from MaxMind
// directly and upload it manually — the auto-update never replaces a
// manually uploaded database.
//
// The unversioned package.json URL resolves to the latest published
// version (jsDelivr caches it ~12h — fine for a daily check); the
// database itself ships as a gzipped `.mmdb` asset pinned to that
// version. Local state (which version was installed, and whether it came
// from a remote download or a manual upload) lives in a JSON sidecar
// next to the database file.

import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { resetGeoReader } from '@kobato/server/domains/analytics/geoip'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { MAXMIND_DB_PATH, MAXMIND_META_PATH } from '@kobato/server/infra/paths'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
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
// Same ceiling as the manual upload endpoint (100 MiB), applied to the
// DECOMPRESSED bytes so a gzip bomb can't slip through.
const MAX_DB_BYTES = 100 * 1024 * 1024

function geoipDownloadUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/${GEOIP_PACKAGE}@${version}/GeoLite2-City.mmdb.gz`
}

// ─── Write lock ──────────────────────────────────────────
// Both writers of the database/meta pair — the remote install below and
// the upload endpoint (`http/resources/maxmind`) — serialize on this
// promise chain. Without it an interleaved pair of writers can leave the
// database file and its meta sidecar describing different installs (e.g.
// the scheduler overwriting a just-uploaded database because it read the
// stale 'remote' meta mid-upload).

let writeChain: Promise<void> = Promise.resolve()

export function withGeoipWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn, fn)
  writeChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// ─── Metadata sidecar ────────────────────────────────────

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
 * Best-effort meta write for callers that have ALREADY swapped the
 * database: the swap is a fact, so a sidecar failure (full disk, …) must
 * not fail the operation — it degrades to a warning. The sidecar only
 * feeds the status display and the auto-update provenance guard.
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

// ─── Status & version check ──────────────────────────────

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

// ─── Download & install ──────────────────────────────────

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
            // DomainError, not a bare Error: without the translation the
            // oRPC guard would surface this as a generic 500 instead of
            // the size-limit message.
            throw new DomainError('INTERNAL', 'GeoIP 数据库超过 100 MB 大小限制')
          }
          yield chunk
        }
      },
      createWriteStream(tmpPath),
    )
    // Validate before the swap, same discipline as the upload endpoint:
    // a corrupt download must never replace a working database.
    try {
      await Reader.open(tmpPath)
    } catch {
      throw new DomainError('INTERNAL', '下载的 GeoIP 数据库无效，已中止')
    }
    await rename(tmpPath, MAXMIND_DB_PATH)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    if (isTimeoutError(err)) {
      // The header-stage catch above only covers fetch's initial await;
      // an abort firing mid-stream rejects pipeline() instead — same
      // TimeoutError DOMException, translated here so the admin sees the
      // timeout message rather than a generic 500.
      throw new DomainError('INTERNAL', 'GeoIP 数据库下载超时，请稍后再试')
    }
    throw err
  }

  // The swap is done — refresh the reader even if the sidecar write
  // below fails (best-effort, see writeGeoipMetaBestEffort).
  resetGeoReader()
  await writeGeoipMetaBestEffort({ version, source: 'remote', updatedAt: new Date().toISOString() })
}

// ─── Update flows ────────────────────────────────────────

export interface GeoipUpdateResult {
  status: 'updated' | 'up-to-date'
  version: string
  previousVersion: string | null
}

async function checkAndInstallRemote(): Promise<GeoipUpdateResult> {
  const latest = await fetchLatestGeoipVersion()
  const installed = existsSync(MAXMIND_DB_PATH)
  const geoipMeta = await readGeoipMeta()
  const previousVersion = geoipMeta?.version ?? null

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

// The manual button and the daily job can overlap; a single module-level
// flight coalesces concurrent manual checks (the write lock serializes
// everything else).
let inflight: Promise<GeoipUpdateResult> | null = null

/** Manual check-and-update: downloads whenever the remote version differs. */
export function runRemoteGeoipUpdate(): Promise<GeoipUpdateResult> {
  inflight ??= withGeoipWriteLock(checkAndInstallRemote).finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * Scheduled auto-update. Conservative by design: it maintains databases
 * it installed itself (and installs one when none exists), but never
 * replaces a manually uploaded database. The provenance check runs
 * INSIDE the write lock so an in-flight manual upload can't be
 * overwritten off a stale meta read.
 */
export async function runScheduledGeoipUpdate(): Promise<void> {
  await withGeoipWriteLock(async () => {
    const installed = existsSync(MAXMIND_DB_PATH)
    const geoipMeta = installed ? await readGeoipMeta() : null
    if (installed && geoipMeta?.source !== 'remote') {
      log.debug('GeoIP auto-update skipped; database was installed manually')
      return
    }
    await checkAndInstallRemote()
  })
}

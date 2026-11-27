import type { City, ReaderModel } from '@maxmind/geoip2-node'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { serverConfig } from '@kobato/server/infra/config'
import { MAXMIND_DB_PATH, isPathInside } from '@kobato/server/infra/data-paths'
import { deleteDevHostValue, readDevHostValue, writeDevHostValue } from '@kobato/server/infra/dev-host-state'
import { getLogger } from '@kobato/server/infra/logger'
import { Reader } from '@maxmind/geoip2-node'
import { existsSync } from 'node:fs'

const log = getLogger('analytics.geoip')

const READER_KEY = 'domains/analytics/geoip/lookup.reader'

let readerPromise: Promise<ReaderModel | null> | undefined
let dbPathForTests: string | null = null

export function __setMaxmindDbPathForTests(path: string | null): void {
  dbPathForTests = path
}

function activeDbPath(): string {
  return dbPathForTests ?? MAXMIND_DB_PATH
}

async function openReader(): Promise<ReaderModel | null> {
  const dbPath = activeDbPath()
  const dataPath = serverConfig.storage.data
  if (!isPathInside(dbPath, dataPath)) {
    log.warn('MaxMind DB path is outside data directory; geo enrichment disabled', {
      path: dbPath,
      dataPath,
    })
    return null
  }
  if (!existsSync(dbPath)) {
    log.debug('MaxMind DB not found; geo enrichment disabled', { path: dbPath })
    return null
  }
  const reader = await Reader.open(dbPath)
  log.info('MaxMind GeoLite2 reader opened', { path: dbPath })
  return reader
}

function memoizedReader(): Promise<ReaderModel | null> | undefined {
  const carried = readDevHostValue(READER_KEY)
  return carried instanceof Promise ? unsafeCast<Promise<ReaderModel | null>>(carried) : readerPromise
}

export function getGeoReader(): Promise<ReaderModel | null> {
  const memoized = memoizedReader()
  if (memoized !== undefined) {
    return memoized
  }
  readerPromise = openReader().catch((err: unknown) => {
    readerPromise = undefined
    deleteDevHostValue(READER_KEY)
    log.warn('MaxMind reader failed to open; will retry on next lookup', {
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  })
  writeDevHostValue(READER_KEY, readerPromise)
  return readerPromise
}

export function resetGeoReader(): void {
  readerPromise = undefined
  deleteDevHostValue(READER_KEY)
}

export async function lookupCity(ip: string): Promise<City | null> {
  if (!ip) {
    return null
  }
  const reader = await getGeoReader()
  if (!reader) {
    return null
  }
  try {
    return reader.city(ip)
  } catch {
    return null
  }
}

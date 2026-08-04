import type { City, ReaderModel } from '@maxmind/geoip2-node'

import { serverConfig } from '@kobato/server/infra/config'
import { getLogger } from '@kobato/server/infra/logger'
import { MAXMIND_DB_PATH, isPathInside } from '@kobato/server/infra/paths'
import { Reader } from '@maxmind/geoip2-node'
import { existsSync } from 'node:fs'

const log = getLogger('analytics.geoip')

let readerPromise: Promise<ReaderModel | null> | undefined

async function openReader(): Promise<ReaderModel | null> {
  const dataPath = serverConfig.storage.data
  if (!isPathInside(MAXMIND_DB_PATH, dataPath)) {
    log.warn('MaxMind DB path is outside data directory; geo enrichment disabled', {
      path: MAXMIND_DB_PATH,
      dataPath,
    })
    return null
  }
  if (!existsSync(MAXMIND_DB_PATH)) {
    log.debug('MaxMind DB not found; geo enrichment disabled', { path: MAXMIND_DB_PATH })
    return null
  }
  // Open failures propagate: `getGeoReader` must not memoize them.
  const reader = await Reader.open(MAXMIND_DB_PATH)
  log.info('MaxMind GeoLite2 reader opened', { path: MAXMIND_DB_PATH })
  return reader
}

export function getGeoReader(): Promise<ReaderModel | null> {
  readerPromise ??= openReader().catch((err: unknown) => {
    // A failed open (transient I/O error, a read racing a database swap)
    // is NOT memoized — caching it would silently disable geo enrichment
    // until the next resetGeoReader(). 'Not installed' / misconfigured
    // results (null above) stay memoized; uploads and remote installs
    // call resetGeoReader() to pick up new files.
    readerPromise = undefined
    log.warn('MaxMind reader failed to open; will retry on next lookup', {
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  })
  return readerPromise
}

/** Clear the cached reader so a newly-uploaded DB is picked up. */
export function resetGeoReader(): void {
  readerPromise = undefined
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    readerPromise = undefined
  })
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
